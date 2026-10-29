import { TRPCError } from "@trpc/server";
import { beforeAll, describe, expect, it } from "vitest";
import { chamadorComo, prepararBase } from "./utils.js";

const codigo = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; }
};
beforeAll(prepararBase);

// Datas em 2025 isolam estes testes dos dados criados pelos outros arquivos (que usam a data atual).
describe("financeiro", () => {
  it("operador não acessa o financeiro (backend)", async () => {
    const op = await chamadorComo("operador");
    expect(await codigo(op.financeiro.painel({ de: "2025-01-01", ate: "2025-01-31" }))).toBe("FORBIDDEN");
    expect(await codigo(op.financeiro.lancamentos())).toBe("FORBIDDEN");
    expect(await codigo(op.financeiro.gerarCobrancas({ mes: "2025-01" }))).toBe("FORBIDDEN");
  });

  it("validações: categoria do tipo errado, valor zero/negativo, data de pagamento futura", async () => {
    const g = await chamadorComo("gestor");
    const cats = await g.financeiro.categorias();
    const despesa = cats.find((c) => c.nome === "Infraestrutura")!;
    const receita = cats.find((c) => c.nome === "Outras receitas")!;
    await expect(g.financeiro.criarLancamento({ tipo: "receita", descricao: "Xx", categoriaId: despesa.id, valor: "10", vencimento: "2025-01-10" })).rejects.toThrow("é de despesa");
    expect(await codigo(g.financeiro.criarLancamento({ tipo: "receita", descricao: "Zero", categoriaId: receita.id, valor: "0", vencimento: "2025-01-10" }))).toBe("BAD_REQUEST");
    expect(await codigo(g.financeiro.criarLancamento({ tipo: "receita", descricao: "Neg", categoriaId: receita.id, valor: "-5", vencimento: "2025-01-10" }))).toBe("BAD_REQUEST");
    const l = await g.financeiro.criarLancamento({ tipo: "receita", descricao: "Futuro", categoriaId: receita.id, valor: "1.234,56", vencimento: "2025-01-10" });
    expect(l.valor).toBe("1234.56");
    expect(l.competencia).toBe("2025-01-01");
    await expect(g.financeiro.baixar({ id: l.id, versao: l.versao, pagoEm: "2099-01-01" })).rejects.toThrow("futuro");
  });

  it("geração de cobranças: idempotente, respeita vigência, situação, setup e dia de cobrança", async () => {
    const g = await chamadorComo("gestor");
    const e = await g.cadastros.criarEmpresa({ nome: "Clínica Cobrança", cidade: "Teste" });
    const ativo = await g.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "597", valorSetup: "497", inicio: "2025-02-05", diaVencimento: 28 });
    await g.contratos.criar({ empresaId: e.id, plano: "Encerrado", valorMensal: "100", inicio: "2024-01-01", fim: "2025-01-31", diaVencimento: 10 });
    const susp = await g.contratos.criar({ empresaId: e.id, plano: "Suspenso", valorMensal: "200", inicio: "2024-01-01", diaVencimento: 10 });
    await g.contratos.alterarSituacao({ id: susp.id, versao: susp.versao, situacao: "suspenso", motivo: "Pausa a pedido" });

    const fev = await g.financeiro.gerarCobrancas({ mes: "2025-02" });
    const nossos = (await g.financeiro.lancamentos({ empresaId: e.id, campoData: "competencia", de: "2025-02-01", ate: "2025-02-28" })).linhas;
    expect(nossos.map((l) => [l.origem, l.valor, l.vencimento]).sort()).toEqual([["mensalidade", "597.00", "2025-02-28"], ["setup", "497.00", "2025-02-28"]]);
    expect(fev.criados).toBeGreaterThanOrEqual(2);

    const denovo = await g.financeiro.gerarCobrancas({ mes: "2025-02" });
    expect(denovo.criados).toBe(0);
    expect((await g.financeiro.lancamentos({ empresaId: e.id, campoData: "competencia", de: "2025-02-01", ate: "2025-02-28" })).total).toBe(2);

    // Março: só mensalidade (setup é único)
    await g.financeiro.gerarCobrancas({ mes: "2025-03" });
    const mar = (await g.financeiro.lancamentos({ empresaId: e.id, campoData: "competencia", de: "2025-03-01", ate: "2025-03-31" })).linhas;
    expect(mar.map((l) => l.origem)).toEqual(["mensalidade"]);
    expect(mar.every((l) => l.descricao.includes(ativo.plano))).toBe(true);
  });

  it("previsto × realizado, baixa com valor diferente, cancelamento, estorno e rastreabilidade", async () => {
    const g = await chamadorComo("gestor");
    const cats = await g.financeiro.categorias();
    const rec = cats.find((c) => c.nome === "Outras receitas")!;
    const desp = cats.find((c) => c.nome === "Ferramentas")!;
    const P = { de: "2025-06-01", ate: "2025-07-31" };
    const r1 = await g.financeiro.criarLancamento({ tipo: "receita", descricao: "R1", categoriaId: rec.id, valor: "0,10", vencimento: "2025-06-10" });
    const r2 = await g.financeiro.criarLancamento({ tipo: "receita", descricao: "R2", categoriaId: rec.id, valor: "0,20", vencimento: "2025-06-20" });
    const r3 = await g.financeiro.criarLancamento({ tipo: "receita", descricao: "R3 cancelada", categoriaId: rec.id, valor: "1000", vencimento: "2025-06-15" });
    await g.financeiro.criarLancamento({ tipo: "despesa", descricao: "D1 paga no ato", categoriaId: desp.id, valor: "50", vencimento: "2025-07-05", pagoEm: "2025-07-05" });

    await g.financeiro.baixar({ id: r1.id, versao: r1.versao, pagoEm: "2025-07-02", valorPago: "0,15" }); // pago em julho, com juros
    await g.financeiro.cancelar({ id: r3.id, versao: r3.versao, motivo: "Duplicada" });
    expect(await codigo(g.financeiro.cancelar({ id: r3.id, versao: r3.versao + 1, motivo: "de novo" }))).toBe("BAD_REQUEST");
    expect(await codigo(g.financeiro.baixar({ id: r2.id, versao: r2.versao + 5, pagoEm: "2025-06-20" }))).toBe("CONFLICT");

    const p = await g.financeiro.painel(P);
    expect(p.previstoReceitas).toBe("0.30"); // cancelada fora; soma exata em centavos
    expect(p.recebido).toBe("0.15");
    expect(p.despesasPagas).toBe("50.00");
    expect(p.saldoRealizado).toBe("-49.85");
    const jun = p.porMes.find((m) => m.mes === "2025-06")!;
    const jul = p.porMes.find((m) => m.mes === "2025-07")!;
    expect(jun).toMatchObject({ previstoReceitas: "0.30", realizadoReceitas: "0.00" });
    expect(jul).toMatchObject({ realizadoReceitas: "0.15", realizadoDespesas: "50.00", saldoRealizado: "-49.85" });
    expect(p.porMes).toHaveLength(2);

    // Rastreabilidade: o número do painel = soma da lista com os mesmos filtros
    const listaRecebido = await g.financeiro.lancamentos({ tipo: "receita", situacao: "pago", campoData: "pagamento", ...P });
    expect(listaRecebido.somaPaga).toBe(p.recebido);
    const listaPrevisto = await g.financeiro.lancamentos({ tipo: "receita", situacao: "ativos", campoData: "vencimento", ...P });
    expect(listaPrevisto.somaPrevista).toBe(p.previstoReceitas);

    // R2 vencida e pendente → em atraso
    expect(Number(p.atrasoReceber.total)).toBeGreaterThanOrEqual(0.2);

    // Estorno volta a pendente e sai do realizado
    const atual = (await g.financeiro.lancamentos({ busca: "R1", ...P, campoData: "vencimento" })).linhas[0];
    await g.financeiro.estornarBaixa({ id: atual.id, versao: atual.versao });
    expect((await g.financeiro.painel(P)).recebido).toBe("0.00");
    // Pago não pode ser editado nem cancelado sem estorno
    const d1 = (await g.financeiro.lancamentos({ busca: "D1", ...P, campoData: "vencimento" })).linhas[0];
    expect(await codigo(g.financeiro.atualizarLancamento({ id: d1.id, versao: d1.versao, valor: "1" }))).toBe("BAD_REQUEST");
    await expect(g.financeiro.cancelar({ id: d1.id, versao: d1.versao, motivo: "teste" })).rejects.toThrow("Estorne");
  });

  it("categoria em uso não muda de tipo; nome duplicado é recusado", async () => {
    const g = await chamadorComo("gestor");
    const cats = await g.financeiro.categorias();
    const usada = cats.find((c) => c.nome === "Outras receitas")!;
    await expect(g.financeiro.salvarCategoria({ id: usada.id, nome: usada.nome, tipo: "despesa" })).rejects.toThrow("em uso");
    await expect(g.financeiro.salvarCategoria({ nome: "outras receitas", tipo: "receita" })).rejects.toThrow("categoria com este nome");
  });
});

describe("datas inexistentes", () => {
  it("31/06 é recusado com erro de validação, não erro interno", async () => {
    const g = await chamadorComo("gestor");
    expect(await codigo(g.financeiro.painel({ de: "2025-06-01", ate: "2025-06-31" }))).toBe("BAD_REQUEST");
    expect(await codigo(g.financeiro.lancamentos({ de: "2025-02-30" }))).toBe("BAD_REQUEST");
  });
});
