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
