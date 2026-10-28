import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { executarCiclo, interromperFollowups } from "../automacoes/motor.js";
import { acoesSchema, condicoesSchema, GATILHOS, gatilhoSchema, passosSchema } from "../automacoes/tipos.js";
import { db } from "../db/index.js";
import { automacao, etapaPipeline, evento, execucaoAutomacao, inscricaoFollowup, notificacao, oportunidade, origemCaptacao, sequenciaFollowup } from "../db/schema.js";
import { auditar } from "../lib/auditoria.js";
import { conflitoDeVersao } from "../lib/integridade.js";
import { autenticado, comPermissao, router } from "./trpc.js";

const novoSegredo = () => randomBytes(24).toString("base64url");

const automacaoInput = z
  .object({
    nome: z.string().trim().min(3, "Dê um nome à automação.").max(120),
    gatilho: gatilhoSchema,
    condicoes: condicoesSchema.prefault({}),
    acoes: acoesSchema,
  })
  .superRefine((a, ctx) => {
    if (a.gatilho === "contrato.vencendo" && a.condicoes.diasAntes === undefined)
      ctx.addIssue({ code: "custom", path: ["condicoes", "diasAntes"], message: "Informe quantos dias antes do vencimento." });
    const precisaOport = ["oportunidade.criada", "oportunidade.etapa_alterada", "oportunidade.encerrada", "lead.captado"];
    if (a.acoes.some((x) => x.tipo === "iniciar_followup") && !precisaOport.includes(a.gatilho))
      ctx.addIssue({ code: "custom", path: ["acoes"], message: "Follow-up só pode ser iniciado por gatilhos de oportunidade ou de lead." });
  });

export const automacoesRouter = router({
  catalogo: comPermissao("automacoes:ler").query(() => ({ gatilhos: GATILHOS })),

  listar: comPermissao("automacoes:ler").query(() =>
    db
      .select({
        a: automacao,
        execucoes: sql<number>`(select count(*)::int from ${execucaoAutomacao} e where e.automacao_id = ${automacao.id} and e.situacao = 'sucesso')`,
        erros: sql<number>`(select count(*)::int from ${execucaoAutomacao} e where e.automacao_id = ${automacao.id} and e.situacao = 'erro')`,
      })
      .from(automacao)
      .orderBy(desc(automacao.criadoEm))
      .limit(200)
      .then((r) => r.map((x) => ({ ...x.a, execucoes: x.execucoes, erros: x.erros }))),
  ),

  salvar: comPermissao("automacoes:gerir")
    .input(z.object({ id: z.string().uuid().optional(), versao: z.number().int().optional(), dados: automacaoInput }))
    .mutation(async ({ ctx, input }) => {
      const { dados } = input;
      if (input.id) {
        const [a] = await db
          .update(automacao)
          .set({ ...dados, versao: sql`${automacao.versao} + 1`, atualizadoEm: new Date() })
          .where(and(eq(automacao.id, input.id), eq(automacao.versao, input.versao ?? -1)))
          .returning();
        if (!a) throw conflitoDeVersao();
        await auditar(ctx.usuario.id, "automacao.atualizar", "automacao", a.id, { gatilho: a.gatilho });
        return a;
      }
      const [a] = await db.insert(automacao).values({ ...dados, criadoPorId: ctx.usuario.id }).returning();
      await auditar(ctx.usuario.id, "automacao.criar", "automacao", a.id, { gatilho: a.gatilho, nome: a.nome });
      return a;
    }),

  definirAtiva: comPermissao("automacoes:gerir")
    .input(z.object({ id: z.string().uuid(), ativa: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [a] = await db.update(automacao).set({ ativa: input.ativa, versao: sql`${automacao.versao} + 1`, atualizadoEm: new Date() }).where(eq(automacao.id, input.id)).returning();
      if (!a) throw new TRPCError({ code: "NOT_FOUND", message: "Automação não encontrada." });
      await auditar(ctx.usuario.id, input.ativa ? "automacao.retomar" : "automacao.pausar", "automacao", a.id);
      return a;
    }),

  execucoes: comPermissao("automacoes:ler")
    .input(z.object({ automacaoId: z.string().uuid().optional(), situacao: z.enum(["sucesso", "ignorada", "erro"]).optional() }).prefault({}))
    .query(({ input }) => {
      const f: SQL[] = [];
      if (input.automacaoId) f.push(eq(execucaoAutomacao.automacaoId, input.automacaoId));
      if (input.situacao) f.push(eq(execucaoAutomacao.situacao, input.situacao));
      return db
        .select({ id: execucaoAutomacao.id, situacao: execucaoAutomacao.situacao, tentativas: execucaoAutomacao.tentativas, erro: execucaoAutomacao.erro, detalhes: execucaoAutomacao.detalhes, criadoEm: execucaoAutomacao.criadoEm, atualizadoEm: execucaoAutomacao.atualizadoEm, automacao: automacao.nome, evento: evento.tipo, payload: evento.payload })
        .from(execucaoAutomacao)
        .innerJoin(automacao, eq(automacao.id, execucaoAutomacao.automacaoId))
        .innerJoin(evento, eq(evento.id, execucaoAutomacao.eventoId))
        .where(f.length ? and(...f) : undefined)
        .orderBy(desc(execucaoAutomacao.atualizadoEm))
        .limit(200);
    }),

  // Saúde da fila: pendentes, com erro e que esgotaram tentativas (exigem intervenção)
  fila: comPermissao("automacoes:ler").query(async () => {
    const porSituacao = await db.select({ situacao: evento.situacao, n: count() }).from(evento).groupBy(evento.situacao);
    const falhos = await db.select().from(evento).where(eq(evento.situacao, "falhou")).orderBy(desc(evento.criadoEm)).limit(100);
    const comErro = await db.select().from(evento).where(and(eq(evento.situacao, "pendente"), sql`${evento.tentativas} > 0`)).orderBy(desc(evento.criadoEm)).limit(100);
    return { porSituacao, falhos, comErro };
  }),

  reprocessarEvento: comPermissao("automacoes:gerir")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [e] = await db.update(evento).set({ situacao: "pendente", tentativas: 0, proximaTentativaEm: null }).where(and(eq(evento.id, input.id), eq(evento.situacao, "falhou"))).returning({ id: evento.id });
      if (!e) throw new TRPCError({ code: "BAD_REQUEST", message: "Só eventos com falha podem ser reprocessados." });
      await auditar(ctx.usuario.id, "automacao.reprocessar_evento", "evento", e.id);
      return { ok: true };
    }),

  processarAgora: comPermissao("automacoes:gerir").mutation(() => executarCiclo({ limite: 200 })),

  // ── Follow-up ──
  sequencias: comPermissao("automacoes:ler").query(() =>
    db
      .select({
        s: sequenciaFollowup,
        ativas: sql<number>`(select count(*)::int from ${inscricaoFollowup} i where i.sequencia_id = ${sequenciaFollowup.id} and i.situacao = 'ativa')`,
      })
      .from(sequenciaFollowup)
      .orderBy(desc(sequenciaFollowup.criadoEm))
      .then((r) => r.map((x) => ({ ...x.s, inscricoesAtivas: x.ativas }))),
  ),

  salvarSequencia: comPermissao("automacoes:gerir")
    .input(z.object({ id: z.string().uuid().optional(), nome: z.string().trim().min(3).max(120), passos: passosSchema, ativa: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...campos } = input;
      const [s] = id
        ? await db.update(sequenciaFollowup).set({ ...campos, atualizadoEm: new Date() }).where(eq(sequenciaFollowup.id, id)).returning()
        : await db.insert(sequenciaFollowup).values(campos).returning();
      if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Sequência não encontrada." });
      await auditar(ctx.usuario.id, id ? "followup.atualizar" : "followup.criar", "sequencia_followup", s.id, { passos: campos.passos.length, ativa: campos.ativa });
      return s;
    }),

  inscricoes: comPermissao("crm:ler")
    .input(z.object({ oportunidadeId: z.string().uuid().optional(), situacao: z.enum(["ativa", "concluida", "interrompida"]).optional() }).prefault({}))
    .query(({ input }) => {
      const f: SQL[] = [];
      if (input.oportunidadeId) f.push(eq(inscricaoFollowup.oportunidadeId, input.oportunidadeId));
      if (input.situacao) f.push(eq(inscricaoFollowup.situacao, input.situacao));
      return db
        .select({ i: inscricaoFollowup, sequencia: sequenciaFollowup.nome, totalPassos: sql<number>`jsonb_array_length(${sequenciaFollowup.passos})`, oportunidade: oportunidade.titulo })
        .from(inscricaoFollowup)
        .innerJoin(sequenciaFollowup, eq(sequenciaFollowup.id, inscricaoFollowup.sequenciaId))
        .innerJoin(oportunidade, eq(oportunidade.id, inscricaoFollowup.oportunidadeId))
        .where(f.length ? and(...f) : undefined)
        .orderBy(desc(inscricaoFollowup.iniciadaEm))
        .limit(300)
        .then((r) => r.map((x) => ({ ...x.i, sequencia: x.sequencia, totalPassos: x.totalPassos, oportunidade: x.oportunidade })));
    }),

  interromperFollowup: comPermissao("crm:escrever")
    .input(z.object({ oportunidadeId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => ({ interrompidas: await interromperFollowups(db, { oportunidadeId: input.oportunidadeId }, `interrompido manualmente por ${ctx.usuario.nome}`) })),

  // ── Origens de captação ──
  origens: comPermissao("automacoes:ler").query(() =>
    db
      .select({ o: origemCaptacao, etapa: etapaPipeline.nome })
      .from(origemCaptacao)
      .innerJoin(etapaPipeline, eq(etapaPipeline.id, origemCaptacao.etapaId))
      .orderBy(desc(origemCaptacao.criadoEm))
      // O segredo nunca volta na listagem
      .then((r) => r.map(({ o: { segredo, ...o }, etapa }) => ({ ...o, etapa, temSegredo: !!segredo }))),
  ),

  criarOrigem: comPermissao("automacoes:gerir")
    .input(z.object({
      nome: z.string().trim().min(3).max(120),
      modo: z.enum(["hmac", "publico"]),
      etapaId: z.string().uuid(),
      origemRotulo: z.string().trim().min(2).max(60).default("site"),
      dominioPermitido: z.string().trim().url("Use o endereço completo, ex.: https://minhaempresa.com.br").max(200).optional().or(z.literal("").transform(() => undefined))
        .transform((v) => (v ? new URL(v).origin : undefined)),
    }))
    .mutation(async ({ ctx, input }) => {
      const [et] = await db.select().from(etapaPipeline).where(and(eq(etapaPipeline.id, input.etapaId), eq(etapaPipeline.ativa, true), eq(etapaPipeline.tipo, "aberta")));
      if (!et) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha uma etapa aberta e ativa." });
      const segredo = input.modo === "hmac" ? novoSegredo() : null;
      const [o] = await db.insert(origemCaptacao).values({ ...input, dominioPermitido: input.dominioPermitido ?? null, segredo }).returning();
      await auditar(ctx.usuario.id, "origem.criar", "origem_captacao", o.id, { modo: o.modo, nome: o.nome });
      // Única vez em que o segredo é devolvido
      return { id: o.id, segredo };
    }),

  rotacionarSegredo: comPermissao("automacoes:gerir")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const segredo = novoSegredo();
      const [o] = await db.update(origemCaptacao).set({ segredo }).where(and(eq(origemCaptacao.id, input.id), eq(origemCaptacao.modo, "hmac"))).returning({ id: origemCaptacao.id });
      if (!o) throw new TRPCError({ code: "BAD_REQUEST", message: "Só origens assinadas (HMAC) têm segredo." });
      await auditar(ctx.usuario.id, "origem.rotacionar_segredo", "origem_captacao", o.id);
      return { segredo };
    }),

  definirOrigemAtiva: comPermissao("automacoes:gerir")
    .input(z.object({ id: z.string().uuid(), ativa: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db.update(origemCaptacao).set({ ativa: input.ativa }).where(eq(origemCaptacao.id, input.id));
      await auditar(ctx.usuario.id, input.ativa ? "origem.reativar" : "origem.revogar", "origem_captacao", input.id);
      return { ok: true };
    }),

  // ── Notificações (cada usuário vê só as suas) ──
  notificacoes: autenticado.query(async ({ ctx }) => {
    const itens = await db.select().from(notificacao).where(eq(notificacao.usuarioId, ctx.usuario.id)).orderBy(desc(notificacao.criadoEm)).limit(50);
    const [{ naoLidas }] = await db.select({ naoLidas: count() }).from(notificacao).where(and(eq(notificacao.usuarioId, ctx.usuario.id), isNull(notificacao.lidaEm)));
    return { itens, naoLidas };
  }),

  marcarLidas: autenticado
    .input(z.object({ ids: z.array(z.string().uuid()).max(100).optional() }).prefault({}))
    .mutation(async ({ ctx, input }) => {
      const f = [eq(notificacao.usuarioId, ctx.usuario.id), isNull(notificacao.lidaEm)];
      if (input.ids?.length) f.push(inArray(notificacao.id, input.ids));
      await db.update(notificacao).set({ lidaEm: new Date() }).where(and(...f));
      return { ok: true };
    }),
});
