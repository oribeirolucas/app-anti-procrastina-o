import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, ilike, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { categoriaFinanceira, contrato, empresa, lancamento } from "../db/schema.js";
import { auditar } from "../lib/auditoria.js";
import { hojeNoFuso, obterFuso } from "../lib/datas.js";
import { deCentavos, normalizarValorBR, paraCentavos } from "../lib/dinheiro.js";
import { conflitoDeVersao } from "../lib/integridade.js";
import { comPermissao, router } from "./trpc.js";

// Fórmulas documentadas em docs/INDICADORES.md (seção Financeiro)

// Formato e existência (rejeita 31/06, 30/02 etc.)
const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((d) => { const x = new Date(`${d}T00:00:00Z`); return !isNaN(x.getTime()) && x.toISOString().slice(0, 10) === d; }, "Data inexistente.");
const mesISO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido (AAAA-MM).");
const valorBase = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    try { return normalizarValorBR(String(v)); }
    catch { ctx.addIssue({ code: "custom", message: "Valor inválido." }); return z.NEVER; }
  })
  ;
const valorPositivo = valorBase.refine((v) => paraCentavos(v) > 0, "O valor precisa ser maior que zero.");
const valorNaoNegativo = valorBase.refine((v) => paraCentavos(v) >= 0, "O valor não pode ser negativo.");
const tipo = z.enum(["receita", "despesa"]);

const primeiroDia = (dataOuMes: string) => `${dataOuMes.slice(0, 7)}-01`;
function ultimoDia(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}
function mesesEntre(de: string, ate: string): string[] {
  const r: string[] = [];
  let [a, m] = de.split("-").map(Number);
  const [af, mf] = ate.split("-").map(Number);
  while (a < af || (a === af && m <= mf)) {
    r.push(`${a}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; a++; }
    if (r.length > 120) break; // limite de 10 anos por consulta
  }
  return r;
}

const filtroLancamentos = z.object({
  tipo: tipo.optional(),
  categoriaId: z.string().uuid().optional(),
  // atrasado = pendente com vencimento antes de hoje
  situacao: z.enum(["pendente", "pago", "cancelado", "atrasado", "ativos"]).optional(),
  campoData: z.enum(["vencimento", "pagamento", "competencia"]).default("vencimento"),
  de: dataISO.optional(),
  ate: dataISO.optional(),
  busca: z.string().trim().max(100).optional(),
  empresaId: z.string().uuid().optional(),
  pagina: z.number().int().min(1).default(1),
});

async function montarFiltros(f: z.infer<typeof filtroLancamentos>): Promise<SQL[]> {
  const w: SQL[] = [];
  if (f.tipo) w.push(eq(lancamento.tipo, f.tipo));
  if (f.categoriaId) w.push(eq(lancamento.categoriaId, f.categoriaId));
  if (f.empresaId) w.push(eq(lancamento.empresaId, f.empresaId));
  if (f.busca) w.push(ilike(lancamento.descricao, `%${f.busca}%`));
  if (f.situacao === "atrasado") {
    w.push(eq(lancamento.situacao, "pendente"), lt(lancamento.vencimento, hojeNoFuso(await obterFuso())));
  } else if (f.situacao === "ativos") w.push(ne(lancamento.situacao, "cancelado"));
  else if (f.situacao) w.push(eq(lancamento.situacao, f.situacao));
  const col = f.campoData === "pagamento" ? lancamento.pagoEm : f.campoData === "competencia" ? lancamento.competencia : lancamento.vencimento;
  if (f.de) w.push(gte(col, f.campoData === "competencia" ? primeiroDia(f.de) : f.de));
  if (f.ate) w.push(lte(col, f.ate));
  return w;
}

async function carregarParaAlterar(id: string, versao: number) {
  const [l] = await db.select().from(lancamento).where(eq(lancamento.id, id));
  if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado." });
  if (l.versao !== versao) throw conflitoDeVersao();
  return l;
}

const POR_PAGINA = 100;

export const financeiroRouter = router({
  categorias: comPermissao("financeiro:ler").query(() =>
    db.select().from(categoriaFinanceira).orderBy(asc(categoriaFinanceira.tipo), asc(categoriaFinanceira.nome)),
  ),

  salvarCategoria: comPermissao("financeiro:escrever")
    .input(z.object({ id: z.string().uuid().optional(), nome: z.string().trim().min(2).max(80), tipo, ativa: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...campos } = input;
      if (id) {
        const [atual] = await db.select().from(categoriaFinanceira).where(eq(categoriaFinanceira.id, id));
        if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada." });
        if (atual.tipo !== campos.tipo) {
          const [u] = await db.select({ n: sql<number>`count(*)::int` }).from(lancamento).where(eq(lancamento.categoriaId, id));
          if (u.n > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Categoria em uso não pode mudar de tipo." });
        }
      }
      const [c] = id
        ? await db.update(categoriaFinanceira).set(campos).where(eq(categoriaFinanceira.id, id)).returning()
        : await db.insert(categoriaFinanceira).values(campos).returning();
      await auditar(ctx.usuario.id, id ? "categoria.atualizar" : "categoria.criar", "categoria_financeira", c.id, campos);
      return c;
    }),

  lancamentos: comPermissao("financeiro:ler")
    .input(filtroLancamentos.default({}))
    .query(async ({ input }) => {
      const where = and(...(await montarFiltros(input)));
      const [linhas, [tot]] = await Promise.all([
        db
          .select({
            id: lancamento.id, tipo: lancamento.tipo, descricao: lancamento.descricao, valor: lancamento.valor,
            competencia: lancamento.competencia, vencimento: lancamento.vencimento, situacao: lancamento.situacao,
            pagoEm: lancamento.pagoEm, valorPago: lancamento.valorPago, origem: lancamento.origem, versao: lancamento.versao,
            motivoCancelamento: lancamento.motivoCancelamento, observacao: lancamento.observacao,
            categoriaId: lancamento.categoriaId, categoria: categoriaFinanceira.nome, empresaId: lancamento.empresaId, empresa: empresa.nome,
          })
          .from(lancamento)
          .innerJoin(categoriaFinanceira, eq(categoriaFinanceira.id, lancamento.categoriaId))
          .leftJoin(empresa, eq(empresa.id, lancamento.empresaId))
          .where(where)
          .orderBy(asc(lancamento.vencimento), asc(lancamento.descricao))
          .limit(POR_PAGINA)
          .offset((input.pagina - 1) * POR_PAGINA),
        db
          .select({
            total: sql<number>`count(*)::int`,
            somaPrevista: sql<string>`coalesce(sum(${lancamento.valor}), 0)::numeric(14,2)::text`,
            somaPaga: sql<string>`coalesce(sum(${lancamento.valorPago}), 0)::numeric(14,2)::text`,
          })
          .from(lancamento)
          .where(where),
      ]);
      return { linhas, ...tot, porPagina: POR_PAGINA };
    }),

  criarLancamento: comPermissao("financeiro:escrever")
    .input(z.object({
      tipo,
      descricao: z.string().trim().min(2, "Descreva o lançamento.").max(200),
      categoriaId: z.string().uuid("Escolha uma categoria."),
      valor: valorPositivo,
      vencimento: dataISO,
      competencia: mesISO.optional(), // padrão: mês do vencimento
      empresaId: z.string().uuid().optional().nullable(),
      observacao: z.string().trim().max(2000).optional().nullable(),
      // Lançar já baixado (ex.: despesa paga no cartão)
      pagoEm: dataISO.optional().nullable(),
      valorPago: valorNaoNegativo.optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [cat] = await db.select().from(categoriaFinanceira).where(eq(categoriaFinanceira.id, input.categoriaId));
      if (!cat || !cat.ativa) throw new TRPCError({ code: "BAD_REQUEST", message: "Categoria inexistente ou desativada." });
      if (cat.tipo !== input.tipo) throw new TRPCError({ code: "BAD_REQUEST", message: `A categoria "${cat.nome}" é de ${cat.tipo}.` });
      const pago = !!input.pagoEm;
      const [l] = await db
        .insert(lancamento)
        .values({
          tipo: input.tipo, descricao: input.descricao, categoriaId: input.categoriaId, valor: input.valor,
          vencimento: input.vencimento, competencia: primeiroDia(input.competencia ?? input.vencimento),
          empresaId: input.empresaId ?? null, observacao: input.observacao ?? null, criadoPorId: ctx.usuario.id,
          situacao: pago ? "pago" : "pendente", pagoEm: input.pagoEm ?? null, valorPago: pago ? (input.valorPago ?? input.valor) : null,
        })
        .returning();
      await auditar(ctx.usuario.id, "lancamento.criar", "lancamento", l.id, { tipo: l.tipo, valor: l.valor });
      return l;
    }),

  atualizarLancamento: comPermissao("financeiro:escrever")
    .input(z.object({
      id: z.string().uuid(), versao: z.number().int().min(1),
      descricao: z.string().trim().min(2).max(200).optional(),
      categoriaId: z.string().uuid().optional(),
      valor: valorPositivo.optional(),
      vencimento: dataISO.optional(),
      competencia: mesISO.optional(),
      observacao: z.string().trim().max(2000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const atual = await carregarParaAlterar(input.id, input.versao);
      if (atual.situacao !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: "Só lançamentos pendentes podem ser editados. Estorne a baixa antes." });
      if (input.categoriaId) {
        const [cat] = await db.select().from(categoriaFinanceira).where(eq(categoriaFinanceira.id, input.categoriaId));
        if (!cat || cat.tipo !== atual.tipo) throw new TRPCError({ code: "BAD_REQUEST", message: "Categoria incompatível com o tipo do lançamento." });
      }
      const { id, versao, competencia, ...campos } = input;
      const [l] = await db
        .update(lancamento)
        .set({ ...campos, ...(competencia ? { competencia: primeiroDia(competencia) } : {}), versao: sql`${lancamento.versao} + 1`, atualizadoEm: new Date() })
        .where(and(eq(lancamento.id, id), eq(lancamento.versao, versao)))
        .returning();
      if (!l) throw conflitoDeVersao();
      await auditar(ctx.usuario.id, "lancamento.atualizar", "lancamento", id, { antes: { valor: atual.valor, vencimento: atual.vencimento }, depois: campos });
      return l;
    }),

  baixar: comPermissao("financeiro:escrever")
    .input(z.object({ id: z.string().uuid(), versao: z.number().int().min(1), pagoEm: dataISO, valorPago: valorNaoNegativo.optional() }))
    .mutation(async ({ ctx, input }) => {
      const atual = await carregarParaAlterar(input.id, input.versao);
      if (atual.situacao !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: `Lançamento já está ${atual.situacao}.` });
      if (input.pagoEm > hojeNoFuso(await obterFuso())) throw new TRPCError({ code: "BAD_REQUEST", message: "A data de pagamento não pode estar no futuro." });
      const valorPago = input.valorPago ?? atual.valor;
      const [l] = await db
        .update(lancamento)
        .set({ situacao: "pago", pagoEm: input.pagoEm, valorPago, versao: sql`${lancamento.versao} + 1`, atualizadoEm: new Date() })
        .where(and(eq(lancamento.id, input.id), eq(lancamento.versao, input.versao)))
        .returning();
      if (!l) throw conflitoDeVersao();
      await auditar(ctx.usuario.id, "lancamento.baixar", "lancamento", l.id, { valor: atual.valor, valorPago, pagoEm: input.pagoEm });
      return l;
    }),

  estornarBaixa: comPermissao("financeiro:escrever")
    .input(z.object({ id: z.string().uuid(), versao: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const atual = await carregarParaAlterar(input.id, input.versao);
      if (atual.situacao !== "pago") throw new TRPCError({ code: "BAD_REQUEST", message: "Só lançamentos pagos podem ser estornados." });
      const [l] = await db
        .update(lancamento)
        .set({ situacao: "pendente", pagoEm: null, valorPago: null, versao: sql`${lancamento.versao} + 1`, atualizadoEm: new Date() })
        .where(and(eq(lancamento.id, input.id), eq(lancamento.versao, input.versao)))
        .returning();
      if (!l) throw conflitoDeVersao();
      await auditar(ctx.usuario.id, "lancamento.estornar", "lancamento", l.id, { pagoEm: atual.pagoEm, valorPago: atual.valorPago });
      return l;
    }),

  cancelar: comPermissao("financeiro:escrever")
    .input(z.object({ id: z.string().uuid(), versao: z.number().int().min(1), motivo: z.string().trim().min(3, "Informe o motivo.").max(200) }))
    .mutation(async ({ ctx, input }) => {
      const atual = await carregarParaAlterar(input.id, input.versao);
      if (atual.situacao !== "pendente") throw new TRPCError({ code: "BAD_REQUEST", message: atual.situacao === "pago" ? "Estorne a baixa antes de cancelar." : "Lançamento já cancelado." });
      const [l] = await db
        .update(lancamento)
        .set({ situacao: "cancelado", motivoCancelamento: input.motivo, versao: sql`${lancamento.versao} + 1`, atualizadoEm: new Date() })
        .where(and(eq(lancamento.id, input.id), eq(lancamento.versao, input.versao)))
        .returning();
      if (!l) throw conflitoDeVersao();
      await auditar(ctx.usuario.id, "lancamento.cancelar", "lancamento", l.id, { motivo: input.motivo, valor: atual.valor });
      return l;
    }),

  // Idempotente: rodar várias vezes para o mesmo mês não duplica (índices únicos + ON CONFLICT DO NOTHING).
  gerarCobrancas: comPermissao("financeiro:escrever")
    .input(z.object({ mes: mesISO }))
    .mutation(async ({ ctx, input }) => {
      const inicio = `${input.mes}-01`;
      const fim = ultimoDia(input.mes);
      const contratos = await db
        .select({ c: contrato, empresa: empresa.nome })
        .from(contrato)
        .innerJoin(empresa, eq(empresa.id, contrato.empresaId))
        .where(and(eq(contrato.situacao, "ativo"), lte(contrato.inicio, fim), or(isNull(contrato.fim), gte(contrato.fim, inicio))));
      if (!contratos.length) return { mes: input.mes, contratos: 0, criados: 0, jaExistentes: 0 };

      const cats = await db.select().from(categoriaFinanceira).where(and(eq(categoriaFinanceira.tipo, "receita"), inArray(sql`lower(${categoriaFinanceira.nome})`, ["mensalidades", "setup"])));
      const catMensal = cats.find((c) => c.nome.toLowerCase() === "mensalidades");
      const catSetup = cats.find((c) => c.nome.toLowerCase() === "setup");
      if (!catMensal || !catSetup) throw new TRPCError({ code: "PRECONDITION_FAILED", message: 'Crie as categorias de receita "Mensalidades" e "Setup" antes de gerar cobranças.' });

      let criados = 0;
      let esperados = 0;
      await db.transaction(async (tx) => {
        for (const { c, empresa: nomeEmpresa } of contratos) {
          const dia = Math.min(c.diaVencimento, Number(fim.slice(8)));
          const valores = [
            { origem: "mensalidade", descricao: `Mensalidade ${c.plano} — ${nomeEmpresa} (${input.mes.slice(5)}/${input.mes.slice(0, 4)})`, valor: c.valorMensal, categoriaId: catMensal.id },
          ];
          if (c.inicio >= inicio && c.inicio <= fim && paraCentavos(c.valorSetup) > 0)
            valores.push({ origem: "setup", descricao: `Setup ${c.plano} — ${nomeEmpresa}`, valor: c.valorSetup, categoriaId: catSetup.id });
          for (const v of valores) {
            esperados++;
            const r = await tx
              .insert(lancamento)
              .values({ ...v, tipo: "receita", competencia: inicio, vencimento: `${input.mes}-${String(dia).padStart(2, "0")}`, empresaId: c.empresaId, contratoId: c.id, criadoPorId: ctx.usuario.id })
              .onConflictDoNothing()
              .returning({ id: lancamento.id });
            criados += r.length;
          }
        }
        await auditar(ctx.usuario.id, "financeiro.gerar_cobrancas", "lancamento", undefined, { mes: input.mes, criados }, tx);
      });
      return { mes: input.mes, contratos: contratos.length, criados, jaExistentes: esperados - criados };
    }),

  painel: comPermissao("financeiro:ler")
    .input(z.object({ de: dataISO, ate: dataISO }).refine((p) => p.de <= p.ate, "Período inválido."))
    .query(async ({ input }) => {
      const { de, ate } = input;
      const hoje = hojeNoFuso(await obterFuso());
      const naoCancelado = ne(lancamento.situacao, "cancelado");
      const soma = (col: typeof lancamento.valor | typeof lancamento.valorPago) => sql<string>`coalesce(sum(${col}), 0)::numeric(14,2)::text`;

      const [realizado, previsto, faturado, atraso, [{ vendido }]] = await Promise.all([
        db.select({ tipo: lancamento.tipo, total: soma(lancamento.valorPago), n: sql<number>`count(*)::int` }).from(lancamento)
          .where(and(eq(lancamento.situacao, "pago"), gte(lancamento.pagoEm, de), lte(lancamento.pagoEm, ate))).groupBy(lancamento.tipo),
        db.select({ tipo: lancamento.tipo, total: soma(lancamento.valor), n: sql<number>`count(*)::int` }).from(lancamento)
          .where(and(naoCancelado, gte(lancamento.vencimento, de), lte(lancamento.vencimento, ate))).groupBy(lancamento.tipo),
        db.select({ total: soma(lancamento.valor) }).from(lancamento)
          .where(and(naoCancelado, eq(lancamento.tipo, "receita"), gte(lancamento.competencia, primeiroDia(de)), lte(lancamento.competencia, ate))),
        db.select({ tipo: lancamento.tipo, total: soma(lancamento.valor), n: sql<number>`count(*)::int` }).from(lancamento)
          .where(and(eq(lancamento.situacao, "pendente"), lt(lancamento.vencimento, hoje))).groupBy(lancamento.tipo),
        db.select({ vendido: sql<string>`coalesce(sum(${contrato.valorMensal}), 0)::numeric(14,2)::text` }).from(contrato).where(eq(contrato.situacao, "ativo")),
      ]);
      const pegar = (lista: { tipo: string; total: string; n?: number }[], t: string) => lista.find((x) => x.tipo === t) ?? { total: "0.00", n: 0 };

      // Série mensal: previsto por vencimento, realizado por pagamento
      const mesVenc = sql<string>`to_char(${lancamento.vencimento}, 'YYYY-MM')`;
      const mesPago = sql<string>`to_char(${lancamento.pagoEm}, 'YYYY-MM')`;
      const [prevMes, realMes] = await Promise.all([
        db.select({ mes: mesVenc, tipo: lancamento.tipo, total: soma(lancamento.valor) }).from(lancamento)
          .where(and(naoCancelado, gte(lancamento.vencimento, de), lte(lancamento.vencimento, ate))).groupBy(mesVenc, lancamento.tipo),
        db.select({ mes: mesPago, tipo: lancamento.tipo, total: soma(lancamento.valorPago) }).from(lancamento)
          .where(and(eq(lancamento.situacao, "pago"), gte(lancamento.pagoEm, de), lte(lancamento.pagoEm, ate))).groupBy(mesPago, lancamento.tipo),
      ]);
      const c = (lista: { mes: string; tipo: string; total: string }[], mes: string, t: string) => paraCentavos(lista.find((x) => x.mes === mes && x.tipo === t)?.total ?? "0");
      const porMes = mesesEntre(de, ate).map((mes) => {
        const pr = c(prevMes, mes, "receita"), pd = c(prevMes, mes, "despesa"), rr = c(realMes, mes, "receita"), rd = c(realMes, mes, "despesa");
        return {
          mes,
          previstoReceitas: deCentavos(pr), previstoDespesas: deCentavos(pd), saldoPrevisto: deCentavos(pr - pd),
          realizadoReceitas: deCentavos(rr), realizadoDespesas: deCentavos(rd), saldoRealizado: deCentavos(rr - rd),
        };
      });

      const porCategoria = await db
        .select({
          categoriaId: categoriaFinanceira.id, categoria: categoriaFinanceira.nome, tipo: categoriaFinanceira.tipo,
          previsto: sql<string>`coalesce(sum(${lancamento.valor}) filter (where ${lancamento.vencimento} between ${de} and ${ate}), 0)::numeric(14,2)::text`,
          realizado: sql<string>`coalesce(sum(${lancamento.valorPago}) filter (where ${lancamento.situacao} = 'pago' and ${lancamento.pagoEm} between ${de} and ${ate}), 0)::numeric(14,2)::text`,
        })
        .from(categoriaFinanceira)
        .innerJoin(lancamento, and(eq(lancamento.categoriaId, categoriaFinanceira.id), naoCancelado))
        .groupBy(categoriaFinanceira.id)
        .having(sql`sum(${lancamento.valor}) filter (where ${lancamento.vencimento} between ${de} and ${ate}) > 0 or sum(${lancamento.valorPago}) filter (where ${lancamento.situacao} = 'pago' and ${lancamento.pagoEm} between ${de} and ${ate}) > 0`)
        .orderBy(asc(categoriaFinanceira.tipo), asc(categoriaFinanceira.nome));

      const recebido = pegar(realizado, "receita"), pagas = pegar(realizado, "despesa");
      const aReceber = pegar(previsto, "receita"), aPagar = pegar(previsto, "despesa");
      return {
        hoje,
        vendido,
        faturado: faturado[0].total,
        recebido: recebido.total,
        despesasPagas: pagas.total,
        saldoRealizado: deCentavos(paraCentavos(recebido.total) - paraCentavos(pagas.total)),
        previstoReceitas: aReceber.total,
        previstoDespesas: aPagar.total,
        saldoPrevisto: deCentavos(paraCentavos(aReceber.total) - paraCentavos(aPagar.total)),
        atrasoReceber: pegar(atraso, "receita"),
        atrasoPagar: pegar(atraso, "despesa"),
        porMes,
        porCategoria,
      };
    }),
});
