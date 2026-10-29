import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { lancamento } from "../src/db/schema.js";
import { somarMeses } from "../src/router/crm/contratos.js";
import { chamadorComo, prepararBase } from "./utils.js";

const codigo = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; }
};
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dias = (n: number) => new Date(Date.now() + n * 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

beforeAll(prepararBase);

describe("somarMeses", () => {
  it("ajusta ao fim do mês e vira o ano", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15");
    expect(somarMeses("2026-03-10", 12)).toBe("2027-03-10");
  });
});

describe("contratos", () => {
  it("venda ganha sem contrato aparece no resumo e some ao registrar o contrato", async () => {
    const g = await chamadorComo("gestor");
    const e = await g.cadastros.criarEmpresa({ nome: "Clínica Ganha", cidade: "Contratos" });
    const o = await g.pipeline.criarOportunidade({ titulo: "Pro anual", empresaId: e.id, valor: "597" });
    const ganha = (await g.pipeline.etapas()).find((x) => x.tipo === "ganha")!;
    await g.pipeline.moverEtapa({ id: o.id, versao: o.versao, etapaId: ganha.id });
    expect((await g.contratos.resumo()).ganhasSemContrato.some((x) => x.id === o.id)).toBe(true);

    // Oportunidade de outra empresa é recusada
    const outra = await g.cadastros.criarEmpresa({ nome: "Outra Empresa", cidade: "Contratos" });
    expect(await codigo(g.contratos.criar({ empresaId: outra.id, oportunidadeId: o.id, plano: "Pro", valorMensal: "597", inicio: hoje(), diaVencimento: 10 }))).toBe("BAD_REQUEST");

    const c = await g.contratos.criar({ empresaId: e.id, oportunidadeId: o.id, plano: "Pro", valorMensal: "597,00", valorSetup: "497", inicio: hoje(), fim: dias(365), diaVencimento: 10 });
    expect(c).toMatchObject({ situacao: "ativo", valorMensal: "597.00", versao: 1 });
    expect((await g.contratos.resumo()).ganhasSemContrato.some((x) => x.id === o.id)).toBe(false);
    // Histórico na empresa
    expect((await g.cadastros.empresa({ id: e.id })).interacoes.some((i) => i.descricao.startsWith("Contrato Pro registrado"))).toBe(true);
  });

  it("validações e permissões", async () => {
    const op = await chamadorComo("operador");
    const g = await chamadorComo("gestor");
    const e = await g.cadastros.criarEmpresa({ nome: "Clínica Validação", cidade: "Contratos" });
    expect(await codigo(op.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "597", inicio: hoje(), diaVencimento: 10 }))).toBe("FORBIDDEN");
    expect(await codigo(op.contratos.listar())).toBe("OK"); // operador consulta
    expect(await codigo(g.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "0", inicio: hoje(), diaVencimento: 10 }))).toBe("BAD_REQUEST");
    expect(await codigo(g.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "100", inicio: hoje(), diaVencimento: 31 }))).toBe("BAD_REQUEST");
    expect(await codigo(g.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "100", inicio: "2026-05-10", fim: "2026-05-01", diaVencimento: 10 }))).toBe("BAD_REQUEST");
    await g.cadastros.arquivarEmpresa({ id: e.id, arquivar: true });
    await expect(g.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "100", inicio: hoje(), diaVencimento: 10 })).rejects.toThrow("arquivada");
  });

  it("edição com versão antiga é recusada; renovação estende do fim atual com reajuste", async () => {
    const g = await chamadorComo("gestor");
    const e = await g.cadastros.criarEmpresa({ nome: "Clínica Renovação", cidade: "Contratos" });
    const c = await g.contratos.criar({ empresaId: e.id, plano: "Essencial", valorMensal: "297", inicio: "2026-01-31", fim: "2027-01-31", diaVencimento: 5 });
    const ed = await g.contratos.atualizar({ id: c.id, versao: c.versao, plano: "Pro", valorMensal: "597" });
    expect(await codigo(g.contratos.atualizar({ id: c.id, versao: c.versao, plano: "Rede" }))).toBe("CONFLICT");
    const r = await g.contratos.renovar({ id: c.id, versao: ed.versao, meses: 12, novoValorMensal: "649,90" });
    expect(r).toMatchObject({ fim: "2028-01-31", valorMensal: "649.90", plano: "Pro" });
    const det = await g.contratos.obter({ id: c.id });
    expect(det.eventos.map((x) => x.acao)).toEqual(expect.arrayContaining(["contrato.criar", "contrato.atualizar", "contrato.renovar"]));
    // Sem fim não renova
    const semFim = await g.contratos.criar({ empresaId: e.id, plano: "Mensal", valorMensal: "100", inicio: hoje(), diaVencimento: 10 });
    await expect(g.contratos.renovar({ id: semFim.id, versao: semFim.versao, meses: 12 })).rejects.toThrow("indeterminado");
  });

  it("contrato vencido renova a partir de hoje", async () => {
    const g = await chamadorComo("gestor");
    const e = await g.cadastros.criarEmpresa({ nome: "Clínica Vencida", cidade: "Contratos" });
    const c = await g.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "597", inicio: "2024-01-01", fim: "2025-01-01", diaVencimento: 10 });
    expect((await g.contratos.listar({ vencimento: "vencidos" })).some((x) => x.id === c.id)).toBe(true);
    const r = await g.contratos.renovar({ id: c.id, versao: c.versao, meses: 6 });
    expect(r.fim).toBe(somarMeses(hoje(), 6));
  });

  it("suspender exige motivo e para as cobranças; cancelar é definitivo e cancela só cobranças futuras", async () => {
    const g = await chamadorComo("gestor");
    const e = await g.cadastros.criarEmpresa({ nome: "Clínica Cancelamento", cidade: "Contratos" });
    const c = await g.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "597", inicio: "2026-01-01", diaVencimento: 10 });
    // Cobranças: uma vencida (dívida real), uma futura
    const cat = (await g.financeiro.categorias()).find((x) => x.nome === "Mensalidades")!;
    await db.insert(lancamento).values([
      { tipo: "receita", descricao: "Mensalidade vencida", categoriaId: cat.id, valor: "597.00", competencia: "2026-01-01", vencimento: dias(-20), contratoId: c.id, empresaId: e.id, origem: "manual" },
      { tipo: "receita", descricao: "Mensalidade futura", categoriaId: cat.id, valor: "597.00", competencia: "2026-01-01", vencimento: dias(20), contratoId: c.id, empresaId: e.id, origem: "manual" },
    ]);
    const lista = await g.contratos.listar({ busca: "Clínica Cancelamento" });
    expect(lista[0]).toMatchObject({ emAtraso: "597.00", cobrancasAtrasadas: 1, faturado: "1194.00", recebido: "0.00", proximaCobranca: dias(20) });

    expect(await codigo(g.contratos.alterarSituacao({ id: c.id, versao: c.versao, situacao: "suspenso" }))).toBe("BAD_REQUEST");
    const s = await g.contratos.alterarSituacao({ id: c.id, versao: c.versao, situacao: "suspenso", motivo: "Clínica em reforma" });
    expect(s.contrato).toMatchObject({ situacao: "suspenso", motivoSituacao: "Clínica em reforma" });
    // Suspenso não gera cobrança nova
    const mes = dias(40).slice(0, 7);
    await g.financeiro.gerarCobrancas({ mes });
    expect((await db.select().from(lancamento).where(eq(lancamento.contratoId, c.id))).length).toBe(2);
    const a = await g.contratos.alterarSituacao({ id: c.id, versao: s.contrato.versao, situacao: "ativo" });
    expect(a.contrato).toMatchObject({ situacao: "ativo", motivoSituacao: null });

    const x = await g.contratos.alterarSituacao({ id: c.id, versao: a.contrato.versao, situacao: "cancelado", motivo: "Fechou a clínica", cancelarCobrancasFuturas: true });
    expect(x.cobrancasCanceladas).toBe(1);
    const cobs = await db.select().from(lancamento).where(eq(lancamento.contratoId, c.id));
    expect(cobs.find((l) => l.descricao === "Mensalidade vencida")!.situacao).toBe("pendente"); // dívida continua
    expect(cobs.find((l) => l.descricao === "Mensalidade futura")!.situacao).toBe("cancelado");
    // Definitivo
    await expect(g.contratos.alterarSituacao({ id: c.id, versao: x.contrato.versao, situacao: "ativo" })).rejects.toThrow("definitivo");
    await expect(g.contratos.atualizar({ id: c.id, versao: x.contrato.versao, plano: "X1" })).rejects.toThrow("cancelado");
    const r = await g.contratos.resumo();
    expect(r.canceladosMes).toBeGreaterThanOrEqual(1);
    expect(Number(r.inadimplencia)).toBeGreaterThanOrEqual(597);
  });
});
