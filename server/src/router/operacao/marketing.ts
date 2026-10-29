import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { categoriaFinanceira, configuracao, contrato, lancamento, oportunidade } from "../../db/schema.js";
import { auditar } from "../../lib/auditoria.js";
import { intervaloDoPeriodo, obterFuso } from "../../lib/datas.js";
import { normalizarValorBR, paraCentavos } from "../../lib/dinheiro.js";
import { comPermissao, router } from "../trpc.js";

const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((d) => { const x = new Date(`${d}T00:00:00Z`); return !isNaN(x.getTime()) && x.toISOString().slice(0, 10) === d; }, "Data inexistente.");

const dias = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86400_000) + 1;

/**
 * Indicadores de aquisição. Fórmulas em docs/INDICADORES.md:
 * gasto = despesas PAGAS na categoria "Marketing" no período (data de pagamento);
 * leads = oportunidades criadas no período; novos clientes = contratos com início no período;
 * CPL = gasto / leads; CAC = gasto / novos clientes.
 */
export const marketingRouter = router({
  resumo: comPermissao("marketing:ver")
    .input(z.object({ de: dataISO, ate: dataISO }).refine((v) => v.ate >= v.de, { message: "O fim precisa ser depois do início.", path: ["ate"] }))
    .query(async ({ input }) => {
      const fuso = await obterFuso();
      const { inicio, fimExclusivo } = intervaloDoPeriodo(input.de, input.ate, fuso);
      const [g] = await db
        .select({ centavos: sql<number>`coalesce(sum(${lancamento.valorPago} * 100), 0)::bigint` })
        .from(lancamento)
        .innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, lancamento.categoriaId))
        .where(and(eq(lancamento.tipo, "despesa"), eq(lancamento.situacao, "pago"), eq(categoriaFinanceira.nome, "Marketing"), gte(lancamento.pagoEm, input.de), lte(lancamento.pagoEm, input.ate)));
      const porOrigem = await db
        .select({ origem: sql<string>`coalesce(${oportunidade.origem}, 'não informada')`, leads: sql<number>`count(*)::int`, ganhas: sql<number>`count(*) filter (where ${oportunidade.situacao} = 'ganha')::int` })
        .from(oportunidade)
        .where(and(gte(oportunidade.criadoEm, inicio), lt(oportunidade.criadoEm, fimExclusivo)))
        .groupBy(sql`1`)
        .orderBy(sql`2 desc`);
      const [n] = await db.select({ novos: sql<number>`count(distinct ${contrato.empresaId})::int` }).from(contrato).where(and(gte(contrato.inicio, input.de), lte(contrato.inicio, input.ate)));
      const [orc] = await db.select().from(configuracao).where(eq(configuracao.chave, "orcamento_marketing_diario"));

      const gasto = Number(g.centavos);
      const leads = porOrigem.reduce((s, o) => s + o.leads, 0);
      const periodoDias = dias(input.de, input.ate);
      const orcamentoDiario = typeof orc?.valor === "string" ? paraCentavos(orc.valor) : null;
      const reais = (c: number | null) => (c === null ? null : (c / 100).toFixed(2));
      return {
        gasto: reais(gasto),
        leads,
        novosClientes: n.novos,
        cpl: leads ? reais(Math.round(gasto / leads)) : null,
        cac: n.novos ? reais(Math.round(gasto / n.novos)) : null,
        gastoMedioDiario: reais(Math.round(gasto / periodoDias)),
        orcamentoDiario: reais(orcamentoDiario),
        porOrigem,
      };
    }),

  salvarOrcamento: comPermissao("config:gerir")
    .input(z.object({ valor: z.string().transform((v, c) => { try { return normalizarValorBR(v); } catch { c.addIssue({ code: "custom", message: "Valor inválido." }); return z.NEVER; } }) }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(configuracao).values({ chave: "orcamento_marketing_diario", valor: input.valor })
        .onConflictDoUpdate({ target: configuracao.chave, set: { valor: input.valor, atualizadoEm: new Date() } });
      await auditar(ctx.usuario.id, "config.orcamento_marketing", "configuracao", "orcamento_marketing_diario", { valor: input.valor });
      return { ok: true };
    }),
});
