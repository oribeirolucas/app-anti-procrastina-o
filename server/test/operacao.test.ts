import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { auditoria, contrato, conversa, empresa, etapaPipeline, mensagem, oportunidade } from "../src/db/schema.js";
import { solicitarAprovacao } from "../src/lib/aprovacoes.js";
import { calcularSaude } from "../src/router/operacao/sucesso.js";
import { chamadorComo, prepararBase } from "./utils.js";

const codigo = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; }
};

beforeAll(prepararBase);

describe("aprovações (governança)", () => {
  it("pedido idempotente; só admin decide; recusa exige motivo; não decide duas vezes", async () => {
    const s = await solicitarAprovacao({ tipo: "desconto", titulo: "Desconto de 20% para Cliente X", valor: "119.40", referencia: "agente-comercial:desc:1" });
    const repetido = await solicitarAprovacao({ tipo: "desconto", titulo: "outro título", referencia: "agente-comercial:desc:1" });
    expect(repetido.id).toBe(s.id);

    const g = await chamadorComo("gestor");
    const a = await chamadorComo("admin");
    const op = await chamadorComo("operador");
    expect(await codigo(op.aprovacoes.listar())).toBe("FORBIDDEN");
    expect((await g.aprovacoes.listar()).itens.some((x) => x.id === s.id)).toBe(true);
    expect(await codigo(g.aprovacoes.decidir({ id: s.id, versao: s.versao, decisao: "aprovar" }))).toBe("FORBIDDEN");
    expect(await codigo(a.aprovacoes.decidir({ id: s.id, versao: s.versao, decisao: "recusar" }))).toBe("BAD_REQUEST");

    const r = await a.aprovacoes.decidir({ id: s.id, versao: s.versao, decisao: "recusar", motivo: "Margem abaixo do mínimo" });
    expect(r).toMatchObject({ situacao: "recusada", motivoDecisao: "Margem abaixo do mínimo" });
    expect(await codigo(a.aprovacoes.decidir({ id: s.id, versao: r.versao, decisao: "aprovar" }))).toBe("CONFLICT");
    const [aud] = await db.select().from(auditoria).where(eq(auditoria.entidadeId, s.id));
    expect(aud.acao).toBe("aprovacao.recusada");
  });
});

describe("agentes", () => {
  it("gestor configura; operador não; modelo validado; edição concorrente recusada", async () => {
    const g = await chamadorComo("gestor");
    const op = await chamadorComo("operador");
    const base = { nome: "Agente Comercial", area: "comercial" as const, systemPrompt: "Você qualifica leads.", provedor: "anthropic" as const, modelo: "claude-sonnet-5-5", ativo: false };
    expect(await codigo(op.agentes.salvar(base))).toBe("FORBIDDEN");
    expect(await codigo(g.agentes.salvar({ ...base, modelo: "modelo com espaço" }))).toBe("BAD_REQUEST");
    const ag = await g.agentes.salvar(base);
    const ed = await g.agentes.salvar({ ...base, id: ag.id, versao: ag.versao, systemPrompt: "Novo prompt" });
    expect(ed.versao).toBe(ag.versao + 1);
    expect(await codigo(g.agentes.salvar({ ...base, id: ag.id, versao: ag.versao, systemPrompt: "Velho" }))).toBe("CONFLICT");
    expect(await codigo(g.agentes.salvar({ ...base, nome: "agente comercial" }))).toBe("CONFLICT");
    expect(await g.agentes.execucoes({ agenteId: ag.id })).toEqual([]);
  });
});

describe("inbox", () => {
  it("lista conversas ativas com a última mensagem, em ordem", async () => {
    const [c] = await db.insert(conversa).values({ idExterno: "5511999990000", nomeExibicao: "Cliente WhatsApp", ultimaMensagemEm: new Date() }).returning();
    await db.insert(mensagem).values([
      { conversaId: c.id, autor: "cliente", texto: "Oi, quero um orçamento", criadoEm: new Date(Date.now() - 60_000) },
      { conversaId: c.id, autor: "ia", texto: "Claro! Qual o tamanho da sua equipe?" },
    ]);
    const op = await chamadorComo("operador");
    const lista = await op.inbox.conversas();
    expect(lista.find((x) => x.id === c.id)).toMatchObject({ nome: "Cliente WhatsApp", ultima: "Claro! Qual o tamanho da sua equipe?" });
    expect((await op.inbox.mensagens({ conversaId: c.id })).map((m) => m.autor)).toEqual(["cliente", "ia"]);
  });
});

describe("marketing", () => {
  it("CPL e CAC a partir de despesas pagas de Marketing, leads e novos clientes do período", async () => {
    const a = await chamadorComo("admin");
    const mkt = (await a.financeiro.categorias()).find((c) => c.nome === "Marketing")!;
    const l = await a.financeiro.criarLancamento({ tipo: "despesa", descricao: "Meta Ads março", categoriaId: mkt.id, valor: "1000", vencimento: "2024-03-10" });
    await a.financeiro.baixar({ id: l.id, versao: l.versao, pagoEm: "2024-03-10" });
    const [etapa] = await db.select().from(etapaPipeline).limit(1);
    const quando = new Date("2024-03-15T15:00:00Z");
    await db.insert(oportunidade).values([1, 2, 3, 4].map((i) => ({ titulo: `Lead ${i}`, etapaId: etapa.id, origem: i <= 3 ? "meta_ads" : "indicacao", criadoEm: quando })));
    const [e] = await db.insert(empresa).values({ nome: "Cliente Março", cidade: "Mkt" }).returning();
    await db.insert(contrato).values({ empresaId: e.id, plano: "Pro", valorMensal: "500", inicio: "2024-03-20", diaVencimento: 10 });

    const r = await a.marketing.resumo({ de: "2024-03-01", ate: "2024-03-31" });
    expect(r).toMatchObject({ gasto: "1000.00", leads: 4, novosClientes: 1, cpl: "250.00", cac: "1000.00", gastoMedioDiario: "32.26" });
    expect(r.porOrigem[0]).toMatchObject({ origem: "meta_ads", leads: 3 });
    expect(await codigo(a.marketing.resumo({ de: "2024-03-31", ate: "2024-03-01" }))).toBe("BAD_REQUEST");
    expect(await codigo((await chamadorComo("operador")).marketing.resumo({ de: "2024-03-01", ate: "2024-03-31" }))).toBe("FORBIDDEN");
  });
});

describe("customer success", () => {
  it("health score desconta por sinal de risco", () => {
    expect(calcularSaude({ diasSemContato: 5, cobrancasVencidas: 0, tarefasAtrasadas: 0, diasParaFim: 200 })).toMatchObject({ score: 100, risco: "baixo" });
    const r = calcularSaude({ diasSemContato: 70, cobrancasVencidas: 1, tarefasAtrasadas: 0, diasParaFim: 10 });
    expect(r).toMatchObject({ score: 20, risco: "alto" });
    expect(r.alertas.map((x) => x.codigo)).toEqual(["cobranca", "sem_contato", "renovacao"]);
  });

  it("lista clientes com contrato ativo, do maior risco para o menor", async () => {
    const g = await chamadorComo("gestor");
    const e = await g.cadastros.criarEmpresa({ nome: "Cliente Sem Contato", cidade: "CS" });
    await g.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "300", inicio: "2025-01-01", diaVencimento: 10 });
    const lista = await g.sucesso.clientes();
    const c = lista.find((x) => x.empresaId === e.id)!;
    expect(c.mrr).toBe("300.00");
    expect(c.alertas.length).toBeGreaterThan(0);
    expect(lista.map((x) => x.score)).toEqual([...lista.map((x) => x.score)].sort((a, b) => a - b));
  });
});
