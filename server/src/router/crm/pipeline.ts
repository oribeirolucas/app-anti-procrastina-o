import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, ilike, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { contato, contrato, empresa, etapaPipeline, interacao, oportunidade, tarefa, usuario } from "../../db/schema.js";
import { auditar } from "../../lib/auditoria.js";
import { normalizarValorBR } from "../../lib/dinheiro.js";
import { emitirEvento } from "../../lib/eventos.js";
import { conflitoDeVersao } from "../../lib/integridade.js";
import { pode } from "../../auth/permissoes.js";
import { autenticado, comPermissao, router } from "../trpc.js";

const valor = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    try { return normalizarValorBR(String(v)); }
    catch { ctx.addIssue({ code: "custom", message: "Valor inválido." }); return z.NEVER; }
  })
  .refine((v) => !v.startsWith("-"), "O valor não pode ser negativo.");
// Formato e existência (rejeita 31/06, 30/02 etc.)
const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((d) => { const x = new Date(`${d}T00:00:00Z`); return !isNaN(x.getTime()) && x.toISOString().slice(0, 10) === d; }, "Data inexistente.");

const oportunidadeInput = z.object({
  titulo: z.string().trim().min(2, "Informe o título.").max(200),
  empresaId: z.string().uuid().optional().nullable(),
  contatoId: z.string().uuid().optional().nullable(),
  etapaId: z.string().uuid().optional(),
  responsavelId: z.string().uuid().optional().nullable(),
  origem: z.string().trim().max(60).optional().nullable(),
  valor: valor.default("0"),
  previsaoFechamento: dataISO.optional().nullable(),
});

async function etapaOuErro(id: string) {
  const [e] = await db.select().from(etapaPipeline).where(eq(etapaPipeline.id, id));
  if (!e) throw new TRPCError({ code: "BAD_REQUEST", message: "Etapa inexistente." });
  return e;
}

export const pipelineRouter = router({
  etapas: autenticado.query(() => db.select().from(etapaPipeline).where(eq(etapaPipeline.ativa, true)).orderBy(asc(etapaPipeline.ordem))),

  salvarEtapa: comPermissao("crm:pipeline")
    .input(z.object({
      id: z.string().uuid().optional(),
      nome: z.string().trim().min(2).max(80),
      ordem: z.number().int().min(0).max(1000),
      tipo: z.enum(["aberta", "ganha", "perdida"]),
      probabilidade: z.number().int().min(0).max(100),
      ativa: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...campos } = input;
      if (id && !campos.ativa) {
        const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(oportunidade).where(eq(oportunidade.etapaId, id));
        if (r.n > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Mova as oportunidades desta etapa antes de desativá-la." });
      }
      const [e] = id
        ? await db.update(etapaPipeline).set(campos).where(eq(etapaPipeline.id, id)).returning()
        : await db.insert(etapaPipeline).values(campos).returning();
      await auditar(ctx.usuario.id, id ? "etapa.atualizar" : "etapa.criar", "etapa_pipeline", e.id, campos);
      return e;
    }),

  oportunidades: comPermissao("crm:ler")
    .input(z.object({
      busca: z.string().trim().max(100).optional(),
      etapaId: z.string().uuid().optional(),
      responsavelId: z.string().uuid().optional(),
      situacao: z.enum(["aberta", "ganha", "perdida"]).optional(),
      origem: z.string().max(60).optional(),
      arquivadas: z.boolean().default(false),
    }).prefault({}))
    .query(({ input }) => {
      const f: SQL[] = [input.arquivadas ? isNotNull(oportunidade.arquivadoEm) : isNull(oportunidade.arquivadoEm)];
      if (input.busca) f.push(or(ilike(oportunidade.titulo, `%${input.busca}%`), ilike(empresa.nome, `%${input.busca}%`))!);
      if (input.etapaId) f.push(eq(oportunidade.etapaId, input.etapaId));
      if (input.responsavelId) f.push(eq(oportunidade.responsavelId, input.responsavelId));
      if (input.situacao) f.push(eq(oportunidade.situacao, input.situacao));
      if (input.origem) f.push(eq(oportunidade.origem, input.origem));
      return db
        .select({
          id: oportunidade.id, titulo: oportunidade.titulo, valor: oportunidade.valor, situacao: oportunidade.situacao,
          origem: oportunidade.origem, etapaId: oportunidade.etapaId, previsaoFechamento: oportunidade.previsaoFechamento,
          empresaId: oportunidade.empresaId, empresa: empresa.nome, contato: contato.nome, responsavel: usuario.nome,
          responsavelId: oportunidade.responsavelId, atualizadoEm: oportunidade.atualizadoEm, versao: oportunidade.versao,
        })
        .from(oportunidade)
        .leftJoin(empresa, eq(empresa.id, oportunidade.empresaId))
        .leftJoin(contato, eq(contato.id, oportunidade.contatoId))
        .leftJoin(usuario, eq(usuario.id, oportunidade.responsavelId))
        .where(f.length ? and(...f) : undefined)
        .orderBy(desc(oportunidade.atualizadoEm))
        .limit(500);
    }),

  oportunidade: comPermissao("crm:ler")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [o] = await db
        .select({ o: oportunidade, empresa: empresa.nome, contato: contato.nome, responsavel: usuario.nome })
        .from(oportunidade)
        .leftJoin(empresa, eq(empresa.id, oportunidade.empresaId))
        .leftJoin(contato, eq(contato.id, oportunidade.contatoId))
        .leftJoin(usuario, eq(usuario.id, oportunidade.responsavelId))
        .where(eq(oportunidade.id, input.id));
      if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });
      const [interacoes, tarefas] = await Promise.all([
        db
          .select({ id: interacao.id, tipo: interacao.tipo, descricao: interacao.descricao, criadoEm: interacao.criadoEm, usuario: usuario.nome, respostaDoContato: interacao.respostaDoContato })
          .from(interacao)
          .leftJoin(usuario, eq(usuario.id, interacao.usuarioId))
          .where(eq(interacao.oportunidadeId, input.id))
          .orderBy(desc(interacao.criadoEm))
          .limit(300),
        db.select().from(tarefa).where(eq(tarefa.oportunidadeId, input.id)).orderBy(asc(tarefa.concluida), asc(tarefa.venceEm)).limit(200),
      ]);
      return { ...o.o, empresa: o.empresa, contato: o.contato, responsavel: o.responsavel, interacoes, tarefas };
    }),

  criarOportunidade: comPermissao("crm:escrever")
    .input(oportunidadeInput)
    .mutation(async ({ ctx, input }) => {
      const etapa = input.etapaId
        ? await etapaOuErro(input.etapaId)
        : (await db.select().from(etapaPipeline).where(and(eq(etapaPipeline.ativa, true), eq(etapaPipeline.tipo, "aberta"))).orderBy(asc(etapaPipeline.ordem)).limit(1))[0];
      if (!etapa) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure ao menos uma etapa aberta no pipeline." });
      if (etapa.tipo !== "aberta") throw new TRPCError({ code: "BAD_REQUEST", message: "Uma oportunidade nova precisa começar numa etapa aberta." });
      if (input.empresaId) {
        const [e] = await db.select({ arquivadoEm: empresa.arquivadoEm }).from(empresa).where(eq(empresa.id, input.empresaId));
        if (!e) throw new TRPCError({ code: "BAD_REQUEST", message: "Empresa inexistente." });
        if (e.arquivadoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Empresa arquivada: reative-a antes de abrir oportunidades." });
      }
      return db.transaction(async (tx) => {
        const [o] = await tx
          .insert(oportunidade)
          .values({ ...input, etapaId: etapa.id, situacao: "aberta", responsavelId: input.responsavelId ?? ctx.usuario.id })
          .returning();
        await tx.insert(interacao).values({ tipo: "alteracao", descricao: `Oportunidade criada na etapa "${etapa.nome}".`, oportunidadeId: o.id, empresaId: o.empresaId, contatoId: o.contatoId, usuarioId: ctx.usuario.id });
        await emitirEvento("oportunidade.criada", { oportunidadeId: o.id, etapaId: etapa.id }, undefined, tx);
        return o;
      });
    }),

  atualizarOportunidade: comPermissao("crm:escrever")
    .input(oportunidadeInput.omit({ etapaId: true }).partial().extend({ id: z.string().uuid(), versao: z.number().int().min(1) }))
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const { id, versao, ...campos } = input;
        const [antes] = await tx.select().from(oportunidade).where(eq(oportunidade.id, id));
        if (!antes) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });
        const [o] = await tx
          .update(oportunidade)
          .set({ ...campos, versao: sql`${oportunidade.versao} + 1`, atualizadoEm: new Date() })
          .where(and(eq(oportunidade.id, id), eq(oportunidade.versao, versao)))
          .returning();
        if (!o) throw conflitoDeVersao();
        const mudancas = Object.entries(campos)
          .filter(([k, v]) => String((antes as Record<string, unknown>)[k] ?? "") !== String(v ?? ""))
          .map(([k, v]) => `${k}: "${(antes as Record<string, unknown>)[k] ?? ""}" → "${v ?? ""}"`);
        if (mudancas.length)
          await tx.insert(interacao).values({ tipo: "alteracao", descricao: `Alterado — ${mudancas.join("; ")}`, oportunidadeId: id, empresaId: o.empresaId, usuarioId: ctx.usuario.id });
        return o;
      }),
    ),

  // Transições: aberta ↔ aberta e aberta → ganha/perdida para todos; reabrir ou trocar uma encerrada exige crm:reabrir.
  moverEtapa: comPermissao("crm:escrever")
    .input(z.object({ id: z.string().uuid(), etapaId: z.string().uuid(), versao: z.number().int().min(1), motivoPerda: z.string().trim().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [antes] = await db.select().from(oportunidade).where(eq(oportunidade.id, input.id));
      if (!antes) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });
      if (antes.arquivadoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Oportunidade arquivada não pode mudar de etapa." });
      if (antes.etapaId === input.etapaId) return antes;
      const [de, para] = await Promise.all([etapaOuErro(antes.etapaId), etapaOuErro(input.etapaId)]);
      if (!para.ativa) throw new TRPCError({ code: "BAD_REQUEST", message: "Etapa desativada." });
      if (antes.situacao !== "aberta" && !pode(ctx.usuario.perfil, "crm:reabrir"))
        throw new TRPCError({ code: "FORBIDDEN", message: "Oportunidade encerrada: só gestor ou admin pode reabrir ou alterar o resultado." });
      if (para.tipo === "perdida" && !input.motivoPerda)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da perda." });
      return db.transaction(async (tx) => {
        const [o] = await tx
          .update(oportunidade)
          .set({
            etapaId: para.id,
            situacao: para.tipo,
            motivoPerda: para.tipo === "perdida" ? input.motivoPerda : null,
            fechadaEm: para.tipo === "aberta" ? null : new Date(),
            versao: sql`${oportunidade.versao} + 1`,
            atualizadoEm: new Date(),
          })
          .where(and(eq(oportunidade.id, input.id), eq(oportunidade.versao, input.versao)))
          .returning();
        if (!o) throw conflitoDeVersao();
        const sufixo = para.tipo === "perdida" ? ` Motivo: ${input.motivoPerda}` : "";
        await tx.insert(interacao).values({ tipo: "alteracao", descricao: `Etapa: "${de.nome}" → "${para.nome}".${sufixo}`, oportunidadeId: o.id, empresaId: o.empresaId, contatoId: o.contatoId, usuarioId: ctx.usuario.id });
        await emitirEvento("oportunidade.etapa_alterada", { oportunidadeId: o.id, deEtapaId: de.id, paraEtapaId: para.id }, undefined, tx);
        if (para.tipo !== "aberta") await emitirEvento("oportunidade.encerrada", { oportunidadeId: o.id, situacao: para.tipo }, undefined, tx);
        if (antes.situacao !== "aberta") await auditar(ctx.usuario.id, "oportunidade.reabrir_ou_alterar_resultado", "oportunidade", o.id, { de: antes.situacao, para: para.tipo }, tx);
        return o;
      });
    }),

  arquivarOportunidade: comPermissao("crm:arquivar")
    .input(z.object({ id: z.string().uuid(), arquivar: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [o] = await db.update(oportunidade).set({ arquivadoEm: input.arquivar ? new Date() : null, versao: sql`${oportunidade.versao} + 1` }).where(eq(oportunidade.id, input.id)).returning();
      if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "Oportunidade não encontrada." });
      await auditar(ctx.usuario.id, input.arquivar ? "oportunidade.arquivar" : "oportunidade.desarquivar", "oportunidade", o.id, { titulo: o.titulo });
      return o;
    }),

  registrarInteracao: comPermissao("crm:escrever")
    .input(z.object({
      tipo: z.enum(["nota", "ligacao", "email", "whatsapp", "reuniao"]),
      descricao: z.string().trim().min(1, "Descreva a interação.").max(5000),
      empresaId: z.string().uuid().optional().nullable(),
      contatoId: z.string().uuid().optional().nullable(),
      oportunidadeId: z.string().uuid().optional().nullable(),
      respostaDoContato: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.empresaId && !input.contatoId && !input.oportunidadeId)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Vincule a interação a uma empresa, contato ou oportunidade." });
      let { empresaId, contatoId } = input;
      if (input.oportunidadeId && (!empresaId || !contatoId)) {
        const [o] = await db.select().from(oportunidade).where(eq(oportunidade.id, input.oportunidadeId));
        empresaId ??= o?.empresaId; contatoId ??= o?.contatoId;
      }
      return db.transaction(async (tx) => {
        const [i] = await tx.insert(interacao).values({ ...input, empresaId, contatoId, usuarioId: ctx.usuario.id }).returning();
        if (input.oportunidadeId) await tx.update(oportunidade).set({ atualizadoEm: new Date() }).where(eq(oportunidade.id, input.oportunidadeId));
        if (input.respostaDoContato) await emitirEvento("interacao.resposta_contato", { interacaoId: i.id, contatoId, oportunidadeId: input.oportunidadeId }, undefined, tx);
        return i;
      });
    }),

  tarefas: comPermissao("crm:ler")
    .input(z.object({ escopo: z.enum(["minhas", "todas"]).default("minhas"), situacao: z.enum(["pendentes", "atrasadas", "concluidas"]).default("pendentes") }).prefault({}))
    .query(({ ctx, input }) => {
      const f: SQL[] = [];
      if (input.escopo === "minhas") f.push(eq(tarefa.responsavelId, ctx.usuario.id));
      if (input.situacao === "concluidas") f.push(eq(tarefa.concluida, true));
      else f.push(eq(tarefa.concluida, false));
      if (input.situacao === "atrasadas") f.push(lte(tarefa.venceEm, new Date()));
      return db
        .select({ id: tarefa.id, titulo: tarefa.titulo, descricao: tarefa.descricao, venceEm: tarefa.venceEm, concluida: tarefa.concluida, origem: tarefa.origem, responsavel: usuario.nome, empresaId: tarefa.empresaId, empresa: empresa.nome, oportunidadeId: tarefa.oportunidadeId, oportunidade: oportunidade.titulo })
        .from(tarefa)
        .leftJoin(usuario, eq(usuario.id, tarefa.responsavelId))
        .leftJoin(empresa, eq(empresa.id, tarefa.empresaId))
        .leftJoin(oportunidade, eq(oportunidade.id, tarefa.oportunidadeId))
        .where(and(...f))
        .orderBy(sql`${tarefa.venceEm} asc nulls last`)
        .limit(300);
    }),

  criarTarefa: comPermissao("crm:escrever")
    .input(z.object({
      titulo: z.string().trim().min(2, "Informe o título.").max(200),
      descricao: z.string().trim().max(5000).optional().nullable(),
      venceEm: z.coerce.date().optional().nullable(),
      responsavelId: z.string().uuid().optional().nullable(),
      empresaId: z.string().uuid().optional().nullable(),
      contatoId: z.string().uuid().optional().nullable(),
      oportunidadeId: z.string().uuid().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [t] = await db.insert(tarefa).values({ ...input, responsavelId: input.responsavelId ?? ctx.usuario.id }).returning();
      return t;
    }),

  concluirTarefa: comPermissao("crm:escrever")
    .input(z.object({ id: z.string().uuid(), concluida: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const [t] = await db.update(tarefa).set({ concluida: input.concluida, concluidaEm: input.concluida ? new Date() : null }).where(eq(tarefa.id, input.id)).returning();
      if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada." });
      return t;
    }),

  contratos: comPermissao("crm:ler")
    .input(z.object({ vencendoEmDias: z.number().int().min(1).max(365).optional() }).prefault({}))
    .query(({ input }) => {
      const f: SQL[] = [];
      if (input.vencendoEmDias) {
        f.push(isNotNull(contrato.fim), eq(contrato.situacao, "ativo"));
        f.push(lte(contrato.fim, sql`(current_date + ${input.vencendoEmDias}::int)`), gte(contrato.fim, sql`current_date`));
      }
      return db
        .select({ c: contrato, empresa: empresa.nome })
        .from(contrato)
        .innerJoin(empresa, eq(empresa.id, contrato.empresaId))
        .where(f.length ? and(...f) : undefined)
        .orderBy(sql`${contrato.fim} asc nulls last`)
        .limit(500)
        .then((r) => r.map((x) => ({ ...x.c, empresa: x.empresa })));
    }),

  salvarContrato: comPermissao("contratos:escrever")
    .input(z.object({
      id: z.string().uuid().optional(),
      empresaId: z.string().uuid(),
      oportunidadeId: z.string().uuid().optional().nullable(),
      plano: z.string().trim().min(2).max(60),
      valorMensal: valor,
      valorSetup: valor.default("0"),
      inicio: dataISO,
      fim: dataISO.optional().nullable(),
      diaVencimento: z.number().int().min(1).max(28),
      situacao: z.enum(["ativo", "suspenso", "cancelado"]).default("ativo"),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.fim && input.fim < input.inicio) throw new TRPCError({ code: "BAD_REQUEST", message: "O fim do contrato precisa ser depois do início." });
      const { id, ...campos } = input;
      return db.transaction(async (tx) => {
      const [c] = id
        ? await tx.update(contrato).set({ ...campos, atualizadoEm: new Date() }).where(eq(contrato.id, id)).returning()
        : await tx.insert(contrato).values(campos).returning();
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
      await tx.insert(interacao).values({ tipo: "alteracao", descricao: `Contrato ${c.plano} ${id ? "atualizado" : "registrado"} (${c.situacao}).`, empresaId: c.empresaId, oportunidadeId: c.oportunidadeId, usuarioId: ctx.usuario.id });
      await auditar(ctx.usuario.id, id ? "contrato.atualizar" : "contrato.criar", "contrato", c.id, { valorMensal: c.valorMensal, situacao: c.situacao }, tx);
      if (!id) await emitirEvento("contrato.criado", { contratoId: c.id, empresaId: c.empresaId }, undefined, tx);
      return c;
      });
    }),
});
