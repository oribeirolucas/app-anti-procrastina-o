import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { agendamento, campanha, campanhaDestinatario, configuracao, conversa, mensagem, oportunidade, retomada } from "../../db/schema.js";
import { solicitarAprovacao } from "../../lib/aprovacoes.js";
import { auditar } from "../../lib/auditoria.js";
import { parseCsv } from "../../lib/csv.js";
import { inicioDoDia, intervaloDoPeriodo, obterFuso } from "../../lib/datas.js";
import { conflitoDeVersao } from "../../lib/integridade.js";
import { obterRecursosPro, recursosProSchema } from "../../lib/recursosPro.js";
import { comPermissao, router } from "../trpc.js";

/** Telefone em dígitos com DDI. Número brasileiro sem DDI (10–11 dígitos) ganha 55. Inválido → null. */
export function normalizarTelefone(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : null;
}

/** "dd/mm/aaaa" + "HH:MM" no fuso da clínica → instante. Data inexistente → null. */
export function instanteLocal(data: string, hora: string, fuso: string): Date | null {
  const md = data.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/), mh = hora.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!md || !mh) return null;
  const iso = `${md[3]}-${md[2].padStart(2, "0")}-${md[1].padStart(2, "0")}`;
  const x = new Date(`${iso}T00:00:00Z`);
  const h = Number(mh[1]), m = Number(mh[2]);
  if (isNaN(x.getTime()) || x.toISOString().slice(0, 10) !== iso || h > 23 || m > 59) return null;
  return new Date(inicioDoDia(iso, fuso).getTime() + (h * 60 + m) * 60_000);
}

const SITUACOES = ["agendado", "confirmado", "cancelado", "remarcar", "sem_resposta", "compareceu", "faltou"] as const;
const linhaAgenda = z.object({ nome: z.string().trim().min(2).max(200), telefone: z.string(), inicio: z.date(), procedimento: z.string().trim().max(120).optional(), profissional: z.string().trim().max(120).optional() });

/** Lê a planilha da agenda: nome; telefone; data (dd/mm/aaaa); hora (HH:MM); procedimento; profissional. Cabeçalho opcional. */
function lerAgenda(csv: string, fuso: string) {
  const linhas = parseCsv(csv);
  const temCabecalho = linhas[0]?.some((c) => /nome|telefone|data/i.test(c));
  const validas: (z.infer<typeof linhaAgenda> & { telefone: string; idExterno: string })[] = [];
  const erros: { linha: number; erro: string }[] = [];
  linhas.slice(temCabecalho ? 1 : 0).forEach((l, i) => {
    const n = i + (temCabecalho ? 2 : 1);
    const [nome = "", tel = "", data = "", hora = "", procedimento = "", profissional = ""] = l.map((x) => x.trim());
    const telefone = normalizarTelefone(tel);
    const inicio = instanteLocal(data, hora, fuso);
    if (nome.length < 2) return erros.push({ linha: n, erro: "Nome obrigatório." });
    if (!telefone) return erros.push({ linha: n, erro: `Telefone inválido: "${tel}".` });
    if (!inicio) return erros.push({ linha: n, erro: `Data/hora inválida: "${data} ${hora}" (use dd/mm/aaaa e HH:MM).` });
    validas.push({ nome: nome.slice(0, 200), telefone, inicio, procedimento: procedimento.slice(0, 120) || undefined, profissional: profissional.slice(0, 120) || undefined,
      idExterno: createHash("sha256").update(`${telefone}|${inicio.toISOString()}`).digest("hex").slice(0, 40) });
  });
  return { validas, erros };
}

export const proRouter = router({
  // ───── Configuração dos recursos (modelos da Meta, horários, ativação) ─────
  configuracao: comPermissao("config:gerir").query(() => obterRecursosPro()),
  salvarConfiguracao: comPermissao("config:gerir").input(recursosProSchema).mutation(async ({ ctx, input }) => {
    await db.insert(configuracao).values({ chave: "recursos_pro", valor: input })
      .onConflictDoUpdate({ target: configuracao.chave, set: { valor: input, atualizadoEm: new Date() } });
    await auditar(ctx.usuario.id, "config.recursos_pro", "configuracao", "recursos_pro", input);
    return { ok: true };
  }),

  // ───── Agenda (base da confirmação de consultas) ─────
  agenda: comPermissao("crm:ler")
    .input(z.object({ de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input }) => {
      const { inicio, fimExclusivo } = intervaloDoPeriodo(input.de, input.ate, await obterFuso());
      return db.select().from(agendamento).where(and(gte(agendamento.inicio, inicio), lt(agendamento.inicio, fimExclusivo))).orderBy(asc(agendamento.inicio)).limit(1000);
    }),

  importarAgenda: comPermissao("crm:escrever")
    .input(z.object({ csv: z.string().max(2_000_000), aplicar: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const { validas, erros } = lerAgenda(input.csv, await obterFuso());
      if (validas.length > 5000) throw new TRPCError({ code: "BAD_REQUEST", message: "Máximo de 5.000 linhas por importação." });
      if (!input.aplicar) return { validas: validas.length, erros, importadas: 0, repetidas: 0, previa: validas.slice(0, 10) };
      const novas = validas.length
        ? await db.insert(agendamento).values(validas.map((v) => ({ ...v, origem: "planilha" }))).onConflictDoNothing().returning({ id: agendamento.id })
        : [];
      await auditar(ctx.usuario.id, "agenda.importar", "agendamento", undefined, { importadas: novas.length, repetidas: validas.length - novas.length, erros: erros.length });
      return { validas: validas.length, erros, importadas: novas.length, repetidas: validas.length - novas.length, previa: [] };
    }),

  criarAgendamento: comPermissao("crm:escrever")
    .input(z.object({ nome: z.string().trim().min(2).max(200), telefone: z.string(), data: z.string(), hora: z.string(), procedimento: z.string().trim().max(120).optional(), profissional: z.string().trim().max(120).optional() }))
    .mutation(async ({ input }) => {
      const telefone = normalizarTelefone(input.telefone);
      if (!telefone) throw new TRPCError({ code: "BAD_REQUEST", message: "Telefone inválido (use DDD + número)." });
      const inicio = instanteLocal(input.data, input.hora, await obterFuso());
      if (!inicio) throw new TRPCError({ code: "BAD_REQUEST", message: "Data ou hora inválida (dd/mm/aaaa e HH:MM)." });
      const [a] = await db.insert(agendamento).values({ nome: input.nome, telefone, inicio, procedimento: input.procedimento || null, profissional: input.profissional || null }).returning();
      return a;
    }),

  alterarAgendamento: comPermissao("crm:escrever")
    .input(z.object({ id: z.string().uuid(), versao: z.number().int(), situacao: z.enum(SITUACOES) }))
    .mutation(async ({ input }) => {
      const [a] = await db.update(agendamento).set({ situacao: input.situacao, versao: input.versao + 1, atualizadoEm: new Date() })
        .where(and(eq(agendamento.id, input.id), eq(agendamento.versao, input.versao))).returning();
      if (!a) throw conflitoDeVersao();
      return a;
    }),

  // ───── Campanhas de reativação (envio só após aprovação) ─────
  campanhas: comPermissao("automacoes:ler").query(async () => {
    const lista = await db.select().from(campanha).orderBy(desc(campanha.criadoEm)).limit(50);
    const totais = lista.length
      ? await db.select({ campanhaId: campanhaDestinatario.campanhaId, situacao: campanhaDestinatario.situacao, n: count(), responderam: sql<number>`count(${campanhaDestinatario.respondeuEm})::int` })
          .from(campanhaDestinatario).where(inArray(campanhaDestinatario.campanhaId, lista.map((c) => c.id))).groupBy(campanhaDestinatario.campanhaId, campanhaDestinatario.situacao)
      : [];
    return lista.map((c) => {
      const t = totais.filter((x) => x.campanhaId === c.id);
      const de = (s: string) => t.find((x) => x.situacao === s)?.n ?? 0;
      return { ...c, total: t.reduce((s, x) => s + x.n, 0), pendentes: de("pendente"), enviados: de("enviado"), falhas: de("falhou"), pulados: de("pulado"), responderam: t.reduce((s, x) => s + x.responderam, 0) };
    });
  }),

  criarCampanha: comPermissao("automacoes:gerir")
    .input(z.object({ nome: z.string().trim().min(3).max(120), csv: z.string().max(2_000_000) }))
    .mutation(async ({ ctx, input }) => {
      const cfg = await obterRecursosPro();
      if (!cfg.reativacao.modelo) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure o modelo de reativação aprovado na Meta (Administração → Recursos Pro) antes de criar campanhas." });
      const linhas = parseCsv(input.csv);
      const corpo = linhas[0]?.some((c) => /nome|telefone/i.test(c)) ? linhas.slice(1) : linhas;
      const vistos = new Set<string>();
      const erros: { linha: number; erro: string }[] = [];
      const destinatarios: { nome: string; telefone: string }[] = [];
      corpo.forEach(([nome = "", tel = ""], i) => {
        const telefone = normalizarTelefone(tel);
        if (nome.trim().length < 2 || !telefone) return erros.push({ linha: i + 1, erro: "Nome ou telefone inválido." });
        if (vistos.has(telefone)) return;
        vistos.add(telefone);
        destinatarios.push({ nome: nome.trim().slice(0, 200), telefone });
      });
      if (!destinatarios.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum destinatário válido (colunas: nome; telefone)." });
      if (destinatarios.length > 5000) throw new TRPCError({ code: "BAD_REQUEST", message: "Máximo de 5.000 destinatários por campanha." });
      const c = await db.transaction(async (tx) => {
        const [c] = await tx.insert(campanha).values({ nome: input.nome, modelo: cfg.reativacao.modelo }).returning();
        await tx.insert(campanhaDestinatario).values(destinatarios.map((d) => ({ ...d, campanhaId: c.id })));
        return c;
      });
      await auditar(ctx.usuario.id, "campanha.criar", "campanha", c.id, { nome: c.nome, destinatarios: destinatarios.length });
      return { ...c, destinatarios: destinatarios.length, erros };
    }),

  /** Mensagem em massa exige o Go do estrategista: cria a solicitação em Aprovações. */
  solicitarEnvio: comPermissao("automacoes:gerir")
    .input(z.object({ id: z.string().uuid(), versao: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [c] = await db.update(campanha).set({ situacao: "aguardando_aprovacao", versao: input.versao + 1, atualizadoEm: new Date() })
        .where(and(eq(campanha.id, input.id), eq(campanha.versao, input.versao), eq(campanha.situacao, "rascunho"))).returning();
      if (!c) throw new TRPCError({ code: "CONFLICT", message: "Campanha já enviada para aprovação ou alterada por outra pessoa." });
      const [{ n }] = await db.select({ n: count() }).from(campanhaDestinatario).where(eq(campanhaDestinatario.campanhaId, c.id));
      const s = await solicitarAprovacao({ tipo: "outro", titulo: `Campanha de reativação "${c.nome}" para ${n} pacientes`, descricao: `Modelo da Meta: ${c.modelo}. Envio em lotes de ${c.limitePorCiclo}; quem pediu para não receber mensagens é pulado.`, referencia: `campanha:${c.id}` });
      await db.update(campanha).set({ solicitacaoId: s.id }).where(eq(campanha.id, c.id));
      await auditar(ctx.usuario.id, "campanha.solicitar_envio", "campanha", c.id, { destinatarios: n });
      return c;
    }),

  cancelarCampanha: comPermissao("automacoes:gerir")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [c] = await db.update(campanha).set({ situacao: "cancelada", atualizadoEm: new Date() })
        .where(and(eq(campanha.id, input.id), inArray(campanha.situacao, ["rascunho", "aguardando_aprovacao", "aprovada", "enviando"]))).returning();
      if (!c) throw new TRPCError({ code: "BAD_REQUEST", message: "Campanha já concluída, recusada ou cancelada." });
      await auditar(ctx.usuario.id, "campanha.cancelar", "campanha", c.id);
      return c;
    }),

  // ───── Relatório mensal de resultados ─────
  relatorio: comPermissao("auditoria:ver")
    .input(z.object({ mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido (AAAA-MM).") }))
    .query(async ({ input }) => {
      const fuso = await obterFuso();
      const [a, m] = input.mes.split("-").map(Number);
      const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
      const { inicio, fimExclusivo } = intervaloDoPeriodo(`${input.mes}-01`, fim, fuso);
      const noMes = (col: Parameters<typeof gte>[0]) => and(gte(col, inicio), lt(col, fimExclusivo));
      const [conv] = await db.select({
        conversas: sql<number>`count(distinct ${mensagem.conversaId})::int`,
        recebidas: sql<number>`count(*) filter (where ${mensagem.autor} = 'cliente')::int`,
        respostasIa: sql<number>`count(*) filter (where ${mensagem.autor} = 'ia' and ${mensagem.origem} = 'atendimento')::int`,
        // Fora do horário comercial: antes das 8h, depois das 18h ou fim de semana (horário local)
        foraDoHorario: sql<number>`count(*) filter (where ${mensagem.autor} = 'cliente' and (extract(hour from ${mensagem.criadoEm} at time zone ${fuso}) not between 8 and 17 or extract(isodow from ${mensagem.criadoEm} at time zone ${fuso}) >= 6))::int`,
      }).from(mensagem).where(noMes(mensagem.criadoEm));
      const [leads] = await db.select({ novos: count(), avancaram: sql<number>`count(*) filter (where ${oportunidade.situacao} = 'ganha' or ${oportunidade.etapaId} not in (select id from etapa_pipeline where ordem = (select min(ordem) from etapa_pipeline)))::int` })
        .from(oportunidade).where(and(noMes(oportunidade.criadoEm), eq(oportunidade.origem, "whatsapp")));
      const [ret] = await db.select({
        enviadas: sql<number>`count(*) filter (where ${retomada.situacao} = 'enviada')::int`,
        responderam: sql<number>`count(*) filter (where ${retomada.situacao} = 'enviada' and exists (select 1 from mensagem mc where mc.conversa_id = ${retomada.conversaId} and mc.autor = 'cliente' and mc.criado_em > ${retomada.criadoEm}))::int`,
      }).from(retomada).where(noMes(retomada.criadoEm));
      const agenda = await db.select({ situacao: agendamento.situacao, n: count(), comLembrete: sql<number>`count(${agendamento.lembreteEnviadoEm})::int` })
        .from(agendamento).where(noMes(agendamento.inicio)).groupBy(agendamento.situacao);
      const [camp] = await db.select({ enviados: sql<number>`count(*) filter (where ${campanhaDestinatario.situacao} = 'enviado')::int`, responderam: sql<number>`count(${campanhaDestinatario.respondeuEm})::int` })
        .from(campanhaDestinatario).where(noMes(campanhaDestinatario.enviadoEm));
      const ag = (s: string) => agenda.find((x) => x.situacao === s)?.n ?? 0;
      const [{ conversasAtivas }] = await db.select({ conversasAtivas: count() }).from(conversa).where(inArray(conversa.situacao, ["ia", "humano"]));
      return {
        mes: input.mes,
        atendimento: { ...conv, conversasAtivas },
        leads: { novos: leads.novos, avancaram: leads.avancaram },
        retomada: ret,
        confirmacao: {
          consultas: agenda.reduce((s, x) => s + x.n, 0), lembretes: agenda.reduce((s, x) => s + x.comLembrete, 0),
          confirmadas: ag("confirmado") + ag("compareceu"), canceladas: ag("cancelado"), remarcar: ag("remarcar"), semResposta: ag("sem_resposta"), faltas: ag("faltou"),
        },
        reativacao: camp,
      };
    }),
});
