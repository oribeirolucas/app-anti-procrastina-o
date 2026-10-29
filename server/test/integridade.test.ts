import { TRPCError } from "@trpc/server";
import { beforeAll, describe, expect, it } from "vitest";
import { chamadorComo, prepararBase } from "./utils.js";

const codigo = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; }
};
beforeAll(prepararBase);

describe("integridade de dados", () => {
  it("duplicidade de empresa (nome+cidade sem diferenciar maiúsculas, e CNPJ) e de e-mail de contato é recusada", async () => {
    const op = await chamadorComo("operador");
    await op.cadastros.criarEmpresa({ nome: "Clínica Duplicada", documento: "11.111.111/0001-11" });
    await expect(op.cadastros.criarEmpresa({ nome: "clínica duplicada" })).rejects.toThrow("nesta cidade");
    // Regra P2: mesmo nome em outra cidade é permitido; repetido na mesma cidade, não
    await op.cadastros.criarEmpresa({ nome: "Clínica Duplicada", cidade: "Recife" });
    await expect(op.cadastros.criarEmpresa({ nome: "CLÍNICA DUPLICADA", cidade: "recife" })).rejects.toThrow("nesta cidade");
    await expect(op.cadastros.criarEmpresa({ nome: "Outra", documento: "11111111000111" })).rejects.toThrow("CNPJ");
    expect(await codigo(op.cadastros.criarEmpresa({ nome: "CNPJ curto", documento: "123" }))).toBe("BAD_REQUEST");
    await op.cadastros.criarContato({ nome: "Ana", email: "ana.dup@teste.dev" });
    await expect(op.cadastros.criarContato({ nome: "Ana 2", email: "ANA.DUP@teste.dev" })).rejects.toThrow("e-mail");
  });

  it("edição concorrente: a segunda gravação com versão antiga é recusada (sem sobrescrita silenciosa)", async () => {
    const op = await chamadorComo("operador");
    const o = await op.pipeline.criarOportunidade({ titulo: "Concorrência", valor: "100" });
    await op.pipeline.atualizarOportunidade({ id: o.id, versao: o.versao, valor: "200" });
    expect(await codigo(op.pipeline.atualizarOportunidade({ id: o.id, versao: o.versao, valor: "300" }))).toBe("CONFLICT");
    expect(await codigo(op.pipeline.moverEtapa({ id: o.id, versao: o.versao, etapaId: (await op.pipeline.etapas())[1].id }))).toBe("CONFLICT");
    expect((await op.pipeline.oportunidade({ id: o.id })).valor).toBe("200.00");
  });

  it("transições: nova oportunidade não nasce encerrada; reabrir encerrada exige gestor", async () => {
    const op = await chamadorComo("operador");
    const g = await chamadorComo("gestor");
    const etapas = await op.pipeline.etapas();
    const ganha = etapas.find((e) => e.tipo === "ganha")!;
    expect(await codigo(op.pipeline.criarOportunidade({ titulo: "Já ganha", etapaId: ganha.id }))).toBe("BAD_REQUEST");
    const o = await op.pipeline.criarOportunidade({ titulo: "Reabrir" });
    const v = await op.pipeline.moverEtapa({ id: o.id, versao: o.versao, etapaId: ganha.id });
    expect(await codigo(op.pipeline.moverEtapa({ id: o.id, versao: v.versao, etapaId: etapas[0].id }))).toBe("FORBIDDEN");
    const reaberta = await g.pipeline.moverEtapa({ id: o.id, versao: v.versao, etapaId: etapas[0].id });
    expect(reaberta.situacao).toBe("aberta");
    expect(reaberta.fechadaEm).toBeNull();
  });

  it("arquivar preserva histórico, some das listas e dos indicadores, e pode ser revertido", async () => {
    const g = await chamadorComo("gestor");
    const e = await g.cadastros.criarEmpresa({ nome: "Empresa Arquivável" });
    const o = await g.pipeline.criarOportunidade({ titulo: "Op Arquivável", empresaId: e.id, valor: "999" });
    const hoje = new Date().toISOString().slice(0, 10);
    const antes = await g.relatorios.indicadores({ de: hoje, ate: hoje });
    await g.pipeline.arquivarOportunidade({ id: o.id, arquivar: true });
    await g.cadastros.arquivarEmpresa({ id: e.id, arquivar: true });
    expect((await g.cadastros.empresas({ busca: "Arquivável" })).total).toBe(0);
    expect((await g.cadastros.empresas({ busca: "Arquivável", arquivados: true })).total).toBe(1);
    expect((await g.pipeline.oportunidades({ busca: "Op Arquivável" })).length).toBe(0);
    const depois = await g.relatorios.indicadores({ de: hoje, ate: hoje });
    expect(Number(antes.pipelineAberto) - Number(depois.pipelineAberto)).toBe(999);
    expect((await g.cadastros.empresa({ id: e.id })).interacoes.some((i) => i.descricao === "Empresa arquivada.")).toBe(true);
    await expect(g.pipeline.criarOportunidade({ titulo: "Nova", empresaId: e.id })).rejects.toThrow("arquivada");
    await g.cadastros.arquivarEmpresa({ id: e.id, arquivar: false });
    expect((await g.cadastros.empresas({ busca: "Arquivável" })).total).toBe(1);
  });

  it("anonimização (LGPD) remove dados pessoais e textos livres; só admin executa", async () => {
    const g = await chamadorComo("gestor");
    const a = await chamadorComo("admin");
    const c = await g.cadastros.criarContato({ nome: "Pessoa Real", email: "pessoa.real@teste.dev", telefone: "11 99999-0000" });
    await g.pipeline.registrarInteracao({ tipo: "nota", descricao: "CPF 123 e endereço", contatoId: c.id });
    expect(await codigo(g.cadastros.anonimizarContato({ id: c.id }))).toBe("FORBIDDEN");
    await a.cadastros.anonimizarContato({ id: c.id });
    const lista = await a.cadastros.contatos({ busca: "pessoa.real" });
    expect(lista.total).toBe(0);
    const arq = (await a.cadastros.contatos({ arquivados: true, busca: "anonimizado" })).linhas.find((x) => x.id === c.id)!;
    expect(arq).toMatchObject({ email: null, telefone: null, descadastrado: true });
    expect(await codigo(a.cadastros.definirDescadastro({ id: c.id, descadastrado: false }))).toBe("BAD_REQUEST");
  });

  it("opt-out é idempotente e gera um único evento", async () => {
    const op = await chamadorComo("operador");
    const c = await op.cadastros.criarContato({ nome: "Opt Out" });
    const r1 = await op.cadastros.definirDescadastro({ id: c.id, descadastrado: true });
    const r2 = await op.cadastros.definirDescadastro({ id: c.id, descadastrado: true });
    expect(r2.versao).toBe(r1.versao);
  });
});
