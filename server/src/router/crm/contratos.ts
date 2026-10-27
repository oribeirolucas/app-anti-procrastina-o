import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, ilike, isNull, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { auditoria, contrato, empresa, interacao, lancamento, oportunidade, usuario } from "../../db/schema.js";
import { auditar } from "../../lib/auditoria.js";
import { hojeNoFuso, obterFuso } from "../../lib/datas.js";
import { normalizarValorBR, paraCentavos } from "../../lib/dinheiro.js";
import { emitirEvento } from "../../lib/eventos.js";
import { conflitoDeVersao } from "../../lib/integridade.js";
import { comPermissao, router } from "../trpc.js";

const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((d) => { const x = new Date(`${d}T00:00:00Z`); return !isNaN(x.getTime()) && x.toISOString().slice(0, 10) === d; }, "Data inexistente.");
const valor = (min: 0 | 1) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      try { return normalizarValorBR(String(v)); }
      catch { ctx.addIssue({ code: "custom", message: "Valor inválido." }); return z.NEVER; }
    })
    .refine((v) => paraCentavos(v) >= min, min ? "O valor precisa ser maior que zero." : "O valor não pode ser negativo.");

const dadosContrato = z.object({
  empresaId: z.string().uuid("Escolha a empresa."),
  oportunidadeId: z.string().uuid().optional().nullable(),
  plano: z.string().trim().min(2, "Informe o plano.").max(60),
  valorMensal: valor(1),
  valorSetup: valor(0).default("0"),
  inicio: dataISO,
  fim: dataISO.optional().nullable(),
  diaVencimento: z.number().int().min(1, "Dia entre 1 e 28.").max(28, "Dia entre 1 e 28."),
  observacoes: z.string().trim().max(2000).optional().nullable(),
});

/** Soma meses a uma data AAAA-MM-DD, ajustando ao último dia do mês (31/01 + 1 mês = 28/02). */
export function somarMeses(data: string, meses: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

async function carregar(id: string, versao: number) {
  const [c] = await db.select().from(contrato).where(eq(contrato.id, id));
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
  if (c.versao !== versao) throw conflitoDeVersao();
  return c;
}

const historico = (tx: Pick<typeof db, "insert">, c: { empresaId: string; oportunidadeId: string | null }, usuarioId: string, descricao: string) =>
  tx.insert(interacao).values({ tipo: "alteracao", descricao, empresaId: c.empresaId, oportunidadeId: c.oportunidadeId, usuarioId });

// Financeiro de cada contrato, calculado a partir das cobranças (lançamentos) vinculadas.
const financeiroDoContrato = (hoje: string) => ({
  faturado: sql<string>`(select coalesce(sum(l.valor), 0)::numeric(14,2)::text from ${lancamento} l where l.contrato_id = ${contrato.id} and l.situacao <> 'cancelado')`,
  recebido: sql<string>`(select coalesce(sum(l.valor_pago), 0)::numeric(14,2)::text from ${lancamento} l where l.contrato_id = ${contrato.id} and l.situacao = 'pago')`,
  emAtraso: sql<string>`(select coalesce(sum(l.valor), 0)::numeric(14,2)::text from ${lancamento} l where l.contrato_id = ${contrato.id} and l.situacao = 'pendente' and l.vencimento < ${hoje})`,
  cobrancasAtrasadas: sql<number>`(select count(*)::int from ${lancamento} l where l.contrato_id = ${contrato.id} and l.situacao = 'pendente' and l.vencimento < ${hoje})`,
  proximaCobranca: sql<string | null>`(select min(l.vencimento)::text from ${lancamento} l where l.contrato_id = ${contrato.id} and l.situacao = 'pendente' and l.vencimento >= ${hoje})`,
});

export const contratosRouter = router({
  // Indicadores do topo da aba (fórmulas em docs/INDICADORES.md)
  resumo: comPermissao("crm:ler").query(async () => {
    const hoje = hojeNoFuso(await obterFuso());
    const em30 = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8) + 30)).toISOString().slice(0, 10);
    const inicioMes = `${hoje.slice(0, 7)}-01`;
    const [[r], ganhasSemContrato] = await Promise.all([
      db
        .select({
          mrrAtivo: sql<string>`coalesce(sum(${contrato.valorMensal}) filter (where ${contrato.situacao} = 'ativo'), 0)::numeric(14,2)::text`,
          ativos: sql<number>`count(*) filter (where ${contrato.situacao} = 'ativo')::int`,
          suspensos: sql<number>`count(*) filter (where ${contrato.situacao} = 'suspenso')::int`,
          vencendo30: sql<number>`count(*) filter (where ${contrato.situacao} = 'ativo' and ${contrato.fim} between ${hoje} and ${em30})::int`,
          vencidos: sql<number>`count(*) filter (where ${contrato.situacao} = 'ativo' and ${contrato.fim} < ${hoje})::int`,
          canceladosMes: sql<number>`count(*) filter (where ${contrato.situacao} = 'cancelado' and ${contrato.canceladoEm} >= ${inicioMes}::date)::int`,
          mrrCanceladoMes: sql<string>`coalesce(sum(${contrato.valorMensal}) filter (where ${contrato.situacao} = 'cancelado' and ${contrato.canceladoEm} >= ${inicioMes}::date), 0)::numeric(14,2)::text`,
          inadimplencia: sql<string>`(select coalesce(sum(l.valor), 0)::numeric(14,2)::text from ${lancamento} l where l.contrato_id is not null and l.situacao = 'pendente' and l.vencimento < ${hoje})`,
        })
        .from(contrato),
      db
        .select({ id: oportunidade.id, titulo: oportunidade.titulo, valor: oportunidade.valor, empresaId: oportunidade.empresaId, empresa: empresa.nome, fechadaEm: oportunidade.fechadaEm })
        .from(oportunidade)
        .leftJoin(empresa, eq(empresa.id, oportunidade.empresaId))
        .where(and(eq(oportunidade.situacao, "ganha"), isNull(oportunidade.arquivadoEm), sql`not exists (select 1 from ${contrato} c where c.oportunidade_id = ${oportunidade.id})`))
        .orderBy(desc(oportunidade.fechadaEm))
        .limit(50),
    ]);
    return { ...r, hoje, ganhasSemContrato };
  }),

  listar: comPermissao("crm:ler")
    .input(z.object({
      busca: z.string().trim().max(100).optional(),
      situacao: z.enum(["ativo", "suspenso", "cancelado", "todos"]).default("ativo"),
      vencimento: z.enum(["30", "60", "90", "vencidos", "sem_fim"]).optional(),
      empresaId: z.string().uuid().optional(),
    }).prefault({}))
    .query(async ({ input }) => {
      const hoje = hojeNoFuso(await obterFuso());
      const f: SQL[] = [];
      if (input.situacao !== "todos") f.push(eq(contrato.situacao, input.situacao));
      if (input.busca) f.push(ilike(empresa.nome, `%${input.busca}%`));
      if (input.empresaId) f.push(eq(contrato.empresaId, input.empresaId));
      if (input.vencimento === "vencidos") f.push(sql`${contrato.fim} < ${hoje}`);
      else if (input.vencimento === "sem_fim") f.push(isNull(contrato.fim));
      else if (input.vencimento) {
        const lim = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8) + Number(input.vencimento))).toISOString().slice(0, 10);
        f.push(gte(contrato.fim, hoje), lte(contrato.fim, lim));
      }
      return db
        .select({ c: contrato, empresa: empresa.nome, ...financeiroDoContrato(hoje) })
        .from(contrato)
        .innerJoin(empresa, eq(empresa.id, contrato.empresaId))
        .where(f.length ? and(...f) : undefined)
        .orderBy(sql`${contrato.fim} asc nulls last`, asc(empresa.nome))
        .limit(500)
        .then((rs) => rs.map(({ c, ...x }) => ({ ...c, ...x, hoje })));
    }),

  obter: comPermissao("crm:ler")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const hoje = hojeNoFuso(await obterFuso());
      const [r] = await db
        .select({ c: contrato, empresa: empresa.nome, oportunidade: oportunidade.titulo, ...financeiroDoContrato(hoje) })
        .from(contrato)
        .innerJoin(empresa, eq(empresa.id, contrato.empresaId))
        .leftJoin(oportunidade, eq(oportunidade.id, contrato.oportunidadeId))
        .where(eq(contrato.id, input.id));
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Contrato não encontrado." });
      const [cobrancas, eventos] = await Promise.all([
        db.select().from(lancamento).where(eq(lancamento.contratoId, input.id)).orderBy(desc(lancamento.vencimento)).limit(120),
        db
          .select({ acao: auditoria.acao, detalhes: auditoria.detalhes, criadoEm: auditoria.criadoEm, usuario: usuario.nome })
          .from(auditoria)
          .leftJoin(usuario, eq(usuario.id, auditoria.usuarioId))
          .where(and(eq(auditoria.entidade, "contrato"), eq(auditoria.entidadeId, input.id)))
          .orderBy(desc(auditoria.criadoEm))
          .limit(100),
      ]);
      const { c, ...x } = r;
      return { ...c, ...x, hoje, cobrancas, eventos };
    }),

  criar: comPermissao("contratos:escrever")
    .input(dadosContrato)
    .mutation(async ({ ctx, input }) => {
      if (input.fim && input.fim < input.inicio) throw new TRPCError({ code: "BAD_REQUEST", message: "O fim do contrato precisa ser depois do início." });
      const [e] = await db.select({ arquivadoEm: empresa.arquivadoEm }).from(empresa).where(eq(empresa.id, input.empresaId));
      if (!e) throw new TRPCError({ code: "BAD_REQUEST", message: "Empresa inexistente." });
      if (e.arquivadoEm) throw new TRPCError({ code: "BAD_REQUEST", message: "Empresa arquivada: reative-a antes de registrar contrato." });
      if (input.oportunidadeId) {
        const [o] = await db.select({ empresaId: oportunidade.empresaId }).from(oportunidade).where(eq(oportunidade.id, input.oportunidadeId));
        if (!o || o.empresaId !== input.empresaId) throw new TRPCError({ code: "BAD_REQUEST", message: "A oportunidade escolhida é de outra empresa." });
      }
      return db.transaction(async (tx) => {
        const [c] = await tx.insert(contrato).values({ ...input, situacao: "ativo" }).returning();
        await historico(tx, c, ctx.usuario.id, `Contrato ${c.plano} registrado: R$ ${c.valorMensal.replace(".", ",")}/mês, início ${c.inicio.split("-").reverse().join("/")}.`);
        await auditar(ctx.usuario.id, "contrato.criar", "contrato", c.id, { plano: c.plano, valorMensal: c.valorMensal, inicio: c.inicio, fim: c.fim }, tx);
        await emitirEvento("contrato.criado", { contratoId: c.id, empresaId: c.empresaId }, undefined, tx);
        return c;
      });
    }),

  atualizar: comPermissao("contratos:escrever")
    .input(dadosContrato.omit({ empresaId: true }).partial().extend({ id: z.string().uuid(), versao: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const atual = await carregar(input.id, input.versao);
      if (atual.situacao === "cancelado") throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato cancelado não pode ser editado." });
      const { id, versao, ...campos } = input;
      const inicio = campos.inicio ?? atual.inicio;
      const fim = campos.fim === undefined ? atual.fim : campos.fim;
      if (fim && fim < inicio) throw new TRPCError({ code: "BAD_REQUEST", message: "O fim do contrato precisa ser depois do início." });
      return db.transaction(async (tx) => {
        const [c] = await tx
          .update(contrato)
          .set({ ...campos, versao: sql`${contrato.versao} + 1`, atualizadoEm: new Date() })
          .where(and(eq(contrato.id, id), eq(contrato.versao, versao)))
          .returning();
        if (!c) throw conflitoDeVersao();
        const mudou = Object.entries(campos).filter(([k, v]) => String((atual as Record<string, unknown>)[k] ?? "") !== String(v ?? ""));
        if (mudou.length) {
          await historico(tx, c, ctx.usuario.id, `Contrato ${c.plano} alterado: ${mudou.map(([k]) => k).join(", ")}.`);
          await auditar(ctx.usuario.id, "contrato.atualizar", "contrato", c.id, Object.fromEntries(mudou.map(([k, v]) => [k, { de: (atual as Record<string, unknown>)[k], para: v }])), tx);
        }
        return c;
      });
    }),

  renovar: comPermissao("contratos:escrever")
    .input(z.object({ id: z.string().uuid(), versao: z.number().int(), meses: z.number().int().min(1).max(60), novoValorMensal: valor(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const atual = await carregar(input.id, input.versao);
      if (atual.situacao === "cancelado") throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato cancelado não pode ser renovado. Registre um novo contrato." });
      if (!atual.fim) throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato sem data de fim já vale por tempo indeterminado." });
      // Renovação conta a partir do fim atual (ou de hoje, se já venceu)
      const hoje = hojeNoFuso(await obterFuso());
      const base = atual.fim < hoje ? hoje : atual.fim;
      const novoFim = somarMeses(base, input.meses);
      return db.transaction(async (tx) => {
        const [c] = await tx
          .update(contrato)
          .set({ fim: novoFim, ...(input.novoValorMensal ? { valorMensal: input.novoValorMensal } : {}), versao: sql`${contrato.versao} + 1`, atualizadoEm: new Date() })
          .where(and(eq(contrato.id, input.id), eq(contrato.versao, input.versao)))
          .returning();
        if (!c) throw conflitoDeVersao();
        const reajuste = input.novoValorMensal && input.novoValorMensal !== atual.valorMensal ? ` Mensalidade: R$ ${atual.valorMensal.replace(".", ",")} → R$ ${input.novoValorMensal.replace(".", ",")}.` : "";
        await historico(tx, c, ctx.usuario.id, `Contrato ${c.plano} renovado por ${input.meses} meses: novo fim ${novoFim.split("-").reverse().join("/")}.${reajuste}`);
        await auditar(ctx.usuario.id, "contrato.renovar", "contrato", c.id, { meses: input.meses, fimAnterior: atual.fim, novoFim, valorAnterior: atual.valorMensal, novoValor: c.valorMensal }, tx);
        return c;
      });
    }),

  // ativo ↔ suspenso; qualquer um → cancelado (definitivo). Suspenso/cancelado não geram novas cobranças.
  alterarSituacao: comPermissao("contratos:escrever")
    .input(z.object({
      id: z.string().uuid(),
      versao: z.number().int(),
      situacao: z.enum(["ativo", "suspenso", "cancelado"]),
      motivo: z.string().trim().max(200).optional(),
      cancelarCobrancasFuturas: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const atual = await carregar(input.id, input.versao);
      if (atual.situacao === input.situacao) return { contrato: atual, cobrancasCanceladas: 0 };
      if (atual.situacao === "cancelado") throw new TRPCError({ code: "BAD_REQUEST", message: "Contrato cancelado é definitivo. Registre um novo contrato." });
      if (input.situacao !== "ativo" && (!input.motivo || input.motivo.length < 3)) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo." });
      const hoje = hojeNoFuso(await obterFuso());
      return db.transaction(async (tx) => {
        const [c] = await tx
          .update(contrato)
          .set({
            situacao: input.situacao,
            motivoSituacao: input.situacao === "ativo" ? null : input.motivo,
            canceladoEm: input.situacao === "cancelado" ? new Date() : null,
            versao: sql`${contrato.versao} + 1`,
            atualizadoEm: new Date(),
          })
          .where(and(eq(contrato.id, input.id), eq(contrato.versao, input.versao)))
          .returning();
        if (!c) throw conflitoDeVersao();
        let cobrancasCanceladas = 0;
        // Cobranças já vencidas continuam em aberto (dívida real); só as futuras são canceladas.
        if (input.situacao === "cancelado" && input.cancelarCobrancasFuturas) {
          const r = await tx
            .update(lancamento)
            .set({ situacao: "cancelado", motivoCancelamento: `Contrato cancelado: ${input.motivo}`.slice(0, 200), versao: sql`${lancamento.versao} + 1`, atualizadoEm: new Date() })
            .where(and(eq(lancamento.contratoId, c.id), eq(lancamento.situacao, "pendente"), gte(lancamento.vencimento, hoje)))
            .returning({ id: lancamento.id });
          cobrancasCanceladas = r.length;
        }
        const rot = { ativo: "reativado", suspenso: "suspenso", cancelado: "cancelado" }[input.situacao];
        await historico(tx, c, ctx.usuario.id, `Contrato ${c.plano} ${rot}${input.motivo && input.situacao !== "ativo" ? `: ${input.motivo}` : ""}.${cobrancasCanceladas ? ` ${cobrancasCanceladas} cobrança(s) futura(s) cancelada(s).` : ""}`);
        await auditar(ctx.usuario.id, `contrato.${input.situacao === "ativo" ? "reativar" : input.situacao === "suspenso" ? "suspender" : "cancelar"}`, "contrato", c.id, { de: atual.situacao, motivo: input.motivo, cobrancasCanceladas }, tx);
        return { contrato: c, cobrancasCanceladas };
      });
    }),
});

