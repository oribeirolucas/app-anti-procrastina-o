import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { evento } from "../src/db/schema.js";
import { parseCsv, gerarCsv } from "../src/lib/csv.js";
import { normalizarValorBR, somar } from "../src/lib/dinheiro.js";
import { chamadorComo, prepararBase } from "./utils.js";

beforeAll(prepararBase);

describe("dinheiro e CSV", () => {
  it("soma em centavos sem erro de ponto flutuante", () => {
    expect(somar(["0.10", "0.20"])).toBe("0.30");
    expect(normalizarValorBR("R$ 1.234,56")).toBe("1234.56");
    expect(normalizarValorBR("597")).toBe("597.00");
    expect(() => normalizarValorBR("abc")).toThrow();
  });
  it("CSV com ; aspas e neutralização de fórmulas", () => {
    expect(parseCsv('nome;obs\r\n"A; B";"diz ""oi"""\n')).toEqual([["nome", "obs"], ["A; B", 'diz "oi"']]);
    expect(gerarCsv(["x"], [["=1+1"]])).toContain("'=1+1");
  });
});

describe("fluxo comercial completo", () => {
  it("empresa → contato → oportunidade → etapas → tarefa → ganho → contrato → indicadores", async () => {
    const op = await chamadorComo("operador");
    const gestor = await chamadorComo("gestor");
    const etapas = await op.pipeline.etapas();
    const [lead, , demo] = etapas;
    const ganha = etapas.find((e) => e.tipo === "ganha")!;
    const perdida = etapas.find((e) => e.tipo === "perdida")!;

    const emp = await op.cadastros.criarEmpresa({ nome: "Clínica Teste Fluxo", documento: "12.345.678/0001-90", uf: "sp" });
    expect(emp.documento).toBe("12345678000190");
    expect(emp.uf).toBe("SP");
    const ct = await op.cadastros.criarContato({ nome: "Dra. Fluxo", email: "Fluxo@Teste.dev", empresaId: emp.id });
    expect(ct.email).toBe("fluxo@teste.dev");

    const o = await op.pipeline.criarOportunidade({ titulo: "Plano Pro", empresaId: emp.id, contatoId: ct.id, valor: "597,00", origem: "ligacao" });
    expect(o.etapaId).toBe(lead.id);
    expect(o.valor).toBe("597.00");
    expect(o.situacao).toBe("aberta");

    const emDemo = await op.pipeline.moverEtapa({ id: o.id, etapaId: demo.id, versao: o.versao });
    await op.pipeline.criarTarefa({ titulo: "Enviar proposta", oportunidadeId: o.id, venceEm: new Date(Date.now() - 1000) });
    const atrasadas = await op.pipeline.tarefas({ situacao: "atrasadas" });
    expect(atrasadas.some((t) => t.titulo === "Enviar proposta")).toBe(true);
    await op.pipeline.registrarInteracao({ tipo: "ligacao", descricao: "Cliente pediu proposta", oportunidadeId: o.id, respostaDoContato: true });

    const ganho = await op.pipeline.moverEtapa({ id: o.id, etapaId: ganha.id, versao: emDemo.versao });
    expect(ganho.situacao).toBe("ganha");
    expect(ganho.fechadaEm).not.toBeNull();

    const detalhe = await op.pipeline.oportunidade({ id: o.id });
    const historico = detalhe.interacoes.map((i) => i.descricao).join(" | ");
    expect(historico).toContain('"Lead" → "Demonstração"');
    expect(historico).toContain("Ganha");
    expect(historico).toContain("Cliente pediu proposta");

    // Perda exige motivo
    const o2 = await op.pipeline.criarOportunidade({ titulo: "Plano Essencial", empresaId: emp.id, valor: "297" });
    await expect(op.pipeline.moverEtapa({ id: o2.id, etapaId: perdida.id, versao: o2.versao })).rejects.toThrow("motivo");
    await op.pipeline.moverEtapa({ id: o2.id, etapaId: perdida.id, versao: o2.versao, motivoPerda: "Preço" });

    // Operador não registra contrato; gestor sim
    await expect(op.pipeline.salvarContrato({ empresaId: emp.id, plano: "Pro", valorMensal: "597", inicio: "2026-10-01", diaVencimento: 10 })).rejects.toThrow("permissão");
    const hoje = new Date();
    const em20 = new Date(hoje.getTime() + 20 * 86400_000).toISOString().slice(0, 10);
    await gestor.pipeline.salvarContrato({ empresaId: emp.id, oportunidadeId: o.id, plano: "Pro", valorMensal: "597", inicio: hoje.toISOString().slice(0, 10), fim: em20, diaVencimento: 10 });
    const vencendo = await op.pipeline.contratos({ vencendoEmDias: 30 });
    expect(vencendo.some((c) => c.empresaId === emp.id)).toBe(true);

    const d = hoje.toISOString().slice(0, 10);
    const ind = await op.relatorios.indicadores({ de: "2020-01-01", ate: d });
    expect(ind.ganhas.quantidade).toBeGreaterThanOrEqual(1);
    expect(ind.perdidas.quantidade).toBeGreaterThanOrEqual(1);
    expect(ind.taxaConversao).not.toBeNull();
    expect(Number(ind.mrrContratado)).toBeGreaterThanOrEqual(597);

    // Eventos para automações foram registrados
    const evs = await db.select().from(evento).where(eq(evento.tipo, "oportunidade.encerrada"));
    expect(evs.length).toBeGreaterThanOrEqual(2);

    // Empresa com contrato ativo não pode ser arquivada; operador não arquiva
    await expect(op.cadastros.arquivarEmpresa({ id: emp.id, arquivar: true })).rejects.toThrow("permissão");
    await expect(gestor.cadastros.arquivarEmpresa({ id: emp.id, arquivar: true })).rejects.toThrow("contrato ativo");
  });

  it("busca e filtros", async () => {
    const op = await chamadorComo("operador");
    await op.cadastros.criarEmpresa({ nome: "Odonto Busca Única", cidade: "Recife", segmento: "odontologia" });
    expect((await op.cadastros.empresas({ busca: "recife" })).linhas.map((e) => e.nome)).toContain("Odonto Busca Única");
    expect((await op.cadastros.empresas({ busca: "inexistente-xyz" })).total).toBe(0);
    expect((await op.pipeline.oportunidades({ situacao: "ganha" })).every((o) => o.situacao === "ganha")).toBe(true);
  });

  it("importação CSV valida antes de gravar e ignora duplicados", async () => {
    const g = await chamadorComo("gestor");
    const csv = "nome;email;telefone;empresa\nAna Import;ana@imp.dev;11999;Clínica Import\nSem email;;;\nX;email-invalido;;\nAna Dup;ana@imp.dev;;";
    const sim = await g.relatorios.importar({ entidade: "contatos", conteudo: csv, simular: true });
    expect(sim).toMatchObject({ simulado: true, total: 4, validos: 2 });
    expect(sim.erros.map((e) => e.linha)).toEqual([4, 5]);
    expect((await g.cadastros.contatos({ busca: "Ana Import" })).total).toBe(0);

    const real = await g.relatorios.importar({ entidade: "contatos", conteudo: csv, simular: false });
    expect(real.validos).toBe(2);
    const ana = (await g.cadastros.contatos({ busca: "Ana Import" })).linhas[0];
    expect(ana.empresa).toBe("Clínica Import");

    const denovo = await g.relatorios.importar({ entidade: "contatos", conteudo: csv, simular: true });
    expect(denovo.erros.some((e) => e.erro.includes("já cadastrado"))).toBe(true);

    const exp = await g.relatorios.exportar({ entidade: "contatos" });
    expect(exp.conteudo).toContain("ana@imp.dev");
  });
});
