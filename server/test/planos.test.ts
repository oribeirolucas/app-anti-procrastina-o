import { TRPCError } from "@trpc/server";
import { beforeAll, describe, expect, it } from "vitest";
import { chamadorComo, prepararBase } from "./utils.js";

const codigo = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; }
};

beforeAll(prepararBase);

describe("catálogo de planos", () => {
  it("só admin gerencia; valores validados; nome único sem diferenciar maiúsculas", async () => {
    const a = await chamadorComo("admin");
    const g = await chamadorComo("gestor");
    expect(await codigo(g.planos.criar({ nome: "Básico", valorMensal: "199" }))).toBe("FORBIDDEN");
    expect(await codigo(a.planos.criar({ nome: "Grátis", valorMensal: "0" }))).toBe("BAD_REQUEST");
    expect(await codigo(a.planos.criar({ nome: "Negativo", valorMensal: "10", valorSetup: "-1" }))).toBe("BAD_REQUEST");
    const p = await a.planos.criar({ nome: "Profissional", valorMensal: "499,90", valorSetup: "300" });
    expect(p.valorMensal).toBe("499.90");
    expect(p.valorSetup).toBe("300.00");
    expect(await codigo(a.planos.criar({ nome: "profissional", valorMensal: "10" }))).toBe("CONFLICT");
  });

  it("inativo some da lista de quem registra contrato; edição com versão antiga é recusada", async () => {
    const a = await chamadorComo("admin");
    const op = await chamadorComo("operador");
    const p = await a.planos.criar({ nome: "Antigo", valorMensal: "99" });
    const ed = await a.planos.atualizar({ id: p.id, versao: p.versao, nome: "Antigo", valorMensal: "99", ativo: false });
    expect(ed.versao).toBe(p.versao + 1);
    expect((await op.planos.listar()).some((x) => x.id === p.id)).toBe(false);
    expect((await a.planos.listar({ incluirInativos: true })).some((x) => x.id === p.id)).toBe(true);
    expect(await codigo(a.planos.atualizar({ id: p.id, versao: p.versao, nome: "Antigo", valorMensal: "120" }))).toBe("CONFLICT");
  });
});

describe("oferta (fonte única para agentes e site)", () => {
  it("entregas em construção aparecem separadas no contexto e no endpoint público, que não exige login", async () => {
    const { db } = await import("../src/db/index.js");
    const { plano } = await import("../src/db/schema.js");
    const { formatarContexto, planosAtivos } = await import("../src/services/contextService.js");
    const { criarServidor } = await import("../src/app.js");
    await db.update(plano).set({ ativo: false }); // isola dos planos criados por outros testes
    const a = await chamadorComo("admin");
    await a.planos.criar({
      nome: "Oferta Teste", valorMensal: "297", valorSetup: "497", promessa: "Nenhum paciente sem resposta", franquiaConversas: 300,
      entregaveis: [{ item: "Atendimento 24h", disponivel: true }, { item: "Confirmação de consultas", disponivel: false }],
    });
    expect(await codigo(a.planos.criar({ nome: "Muitas", valorMensal: "1", entregaveis: Array.from({ length: 31 }, (_, i) => ({ item: `item ${i}`, disponivel: true })) }))).toBe("BAD_REQUEST");

    const ctx = formatarContexto({ conversaId: "x", contato: null, oportunidade: null, contratosAtivos: [], historicoCompras: [], planos: await planosAtivos(), baseConhecimento: "" }, "2026-10-28");
    expect(ctx).toContain("Entrega hoje: Atendimento 24h");
    expect(ctx).toContain("Em construção (não vender): Confirmação de consultas");
    expect(ctx).toContain("até 300 conversas/mês");

    const srv = criarServidor().listen(0);
    try {
      const { port } = srv.address() as import("node:net").AddressInfo;
      const r = await fetch(`http://127.0.0.1:${port}/publico/oferta`);
      expect(r.status).toBe(200);
      expect(r.headers.get("access-control-allow-origin")).toBe("*");
      const corpo = await r.json();
      expect(corpo.planos).toEqual([expect.objectContaining({ nome: "Oferta Teste", inclui: ["Atendimento 24h"], emBreve: ["Confirmação de consultas"], franquiaConversas: 300 })]);
      expect(JSON.stringify(corpo)).not.toMatch(/versao|"id"/); // só o necessário para o site
    } finally { srv.close(); }
  });
});
