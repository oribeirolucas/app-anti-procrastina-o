import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { agendamento, agente, campanha, campanhaDestinatario, contato, conversa, mensagem, retomada, tarefa } from "../src/db/schema.js";
import { hojeNoFuso } from "../src/lib/datas.js";
import { instanteLocal, normalizarTelefone } from "../src/router/operacao/pro.js";
import { processarConversa, type DepsAtendimento } from "../src/services/atendimentoService.js";
import type { PedidoLLM, ProvedorLLM, SaidaAgente } from "../src/services/llmService.js";
import { enviarLembretes, executarCampanhas, executarRetomadas } from "../src/services/recursosProService.js";
import { WhatsAppDesligado } from "../src/services/whatsappService.js";
import { extrairMensagens, registrarMensagemRecebida } from "../src/webhooks/whatsapp.js";
import { chamadorComo, prepararBase } from "./utils.js";

const codigo = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; } };
const FUSO = "America/Sao_Paulo";
const HORA = 3600_000;
let seq = 0;
const tel = () => `55219${String(Date.now()).slice(-6)}${seq++}`;
const ddmmaaaa = (iso: string) => iso.split("-").reverse().join("/");
const somaDias = (iso: string, n: number) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
class LLMFalso implements ProvedorLLM {
  pedidos: PedidoLLM[] = [];
  constructor(public saida: SaidaAgente) {}
  async gerar(p: PedidoLLM) { this.pedidos.push(p); return { saida: this.saida, tokensEntrada: 10, tokensSaida: 5, modeloUsado: p.modelo }; }
}
const acao = (tipo: SaidaAgente["acoes"][number]["tipo"], descricao: string | null = null) => ({ tipo, descricao, percentual: null, valor: null });
const payload = (t: string, texto: string) => ({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: t, profile: { name: "Ana Paciente" } }], messages: [{ from: t, id: `wamid.pro.${t}.${seq++}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } }] } }] }] });

async function configurar(parcial: Record<string, unknown>) {
  const a = await chamadorComo("admin");
  await a.pro.salvarConfiguracao({ idiomaModelos: "pt_BR", retomada: {}, confirmacao: {}, reativacao: {}, ...parcial } as never);
  return a;
}

beforeAll(async () => {
  await prepararBase();
  for (const area of ["marketing", "comercial", "cs"] as const)
    await db.insert(agente).values({ nome: `Agente ${area} (teste pro)`, area, systemPrompt: "p", modelo: "claude-opus-5-5", ativo: true }).onConflictDoNothing();
});

describe("utilitários", () => {
  it("telefone e data/hora locais", () => {
    expect(normalizarTelefone("(11) 98888-7777")).toBe("5511988887777");
    expect(normalizarTelefone("+55 11 98888-7777")).toBe("5511988887777");
    expect(normalizarTelefone("123")).toBeNull();
    expect(instanteLocal("31/06/2026", "10:00", FUSO)).toBeNull(); // data inexistente
    expect(instanteLocal("15/07/2026", "25:00", FUSO)).toBeNull();
    expect(instanteLocal("15/07/2026", "10:30", FUSO)?.toISOString()).toBe("2026-07-15T13:30:00.000Z");
  });
});

describe("agenda e confirmação de consultas", () => {
  it("importação com prévia, erro por linha e sem duplicar ao reimportar", async () => {
    const g = await chamadorComo("gestor");
    const t = tel();
    const csv = `nome;telefone;data;hora;procedimento\nAna Souza;${t.slice(2)};20/11/2026;14:00;Limpeza de pele\nSem Fone;abc;20/11/2026;15:00;x\nData Ruim;11999998888;31/02/2026;10:00;x`;
    const previa = await g.pro.importarAgenda({ csv });
    expect(previa).toMatchObject({ validas: 1, importadas: 0 });
    expect(previa.erros.map((e) => e.linha)).toEqual([3, 4]);
    expect((await g.pro.importarAgenda({ csv, aplicar: true })).importadas).toBe(1);
    expect((await g.pro.importarAgenda({ csv, aplicar: true })).repetidas).toBe(1);
    expect(await codigo((await chamadorComo("operador")).pro.salvarConfiguracao({ idiomaModelos: "pt_BR", retomada: {}, confirmacao: {}, reativacao: {} } as never))).toBe("FORBIDDEN");
  });

  it("lembrete na véspera, uma vez só, a partir da hora configurada; resposta do paciente atualiza a agenda", async () => {
    await configurar({ confirmacao: { ativo: true, horaEnvio: 10, modelo: "confirmacao_consulta" } });
    const t = tel();
    const hoje = hojeNoFuso(FUSO);
    const amanha = somaDias(hoje, 1);
    const g = await chamadorComo("gestor");
    const ag = await g.pro.criarAgendamento({ nome: "Bruna Lima", telefone: t, data: ddmmaaaa(amanha), hora: "15:30", procedimento: "Botox" });

    const canal = new WhatsAppDesligado("teste");
    await enviarLembretes(canal, instanteLocal(ddmmaaaa(hoje), "09:00", FUSO)!); // antes da hora: nada
    expect(canal.modelos.filter((m) => m.para === t)).toHaveLength(0);
    await enviarLembretes(canal, instanteLocal(ddmmaaaa(hoje), "10:05", FUSO)!);
    await enviarLembretes(canal, instanteLocal(ddmmaaaa(hoje), "11:00", FUSO)!); // repetir não reenvia
    const enviados = canal.modelos.filter((m) => m.para === t);
    expect(enviados).toEqual([{ para: t, modelo: "confirmacao_consulta", parametros: ["Bruna", ddmmaaaa(amanha).slice(0, 5), "15:30", "Botox"] }]);

    // Paciente responde "não vou poder": IA cancela e a recepção recebe tarefa de vaga livre
    const r = await registrarMensagemRecebida(extrairMensagens(payload(t, "não vou poder ir amanhã"))[0]);
    const llm = new LLMFalso({ resposta: "Tudo bem, Bruna! Vou avisar a recepção.", acoes: [acao("cancelar_consulta", "imprevisto no trabalho")] });
    const d: DepsAtendimento = { provedores: { anthropic: llm }, canal, transcritor: { transcrever: async () => ({ texto: "", segundos: 0 }) }, modeloPadrao: "claude-opus-5-5" };
    await processarConversa(r.conversaId, d);
    expect(llm.pedidos[0].contexto).toContain("Consulta agendada:");
    const [depois] = await db.select().from(agendamento).where(eq(agendamento.id, ag.id));
    expect(depois).toMatchObject({ situacao: "cancelado", observacao: "imprevisto no trabalho" });
    expect((await db.select().from(tarefa).where(eq(tarefa.titulo, "Consulta cancelada pelo paciente: vaga livre"))).length).toBeGreaterThan(0);
  });
});

describe("retomada de quem não respondeu", () => {
  async function conversaSilenciosa(horasAtras: number, nome = "Carla Teste") {
    const t = tel();
    const r = await registrarMensagemRecebida(extrairMensagens(payload(t, "quanto custa o preenchimento?"))[0]);
    const quando = new Date(Date.now() - horasAtras * HORA);
    await db.update(mensagem).set({ criadoEm: new Date(quando.getTime() - 60_000), processadaEm: new Date() }).where(eq(mensagem.conversaId, r.conversaId));
    await db.insert(mensagem).values({ conversaId: r.conversaId, autor: "ia", texto: "O valor é R$ 1.200. Quer agendar?", criadoEm: quando, processadaEm: new Date() });
    await db.update(contato).set({ nome }).where(eq(contato.telefone, t));
    return { t, conversaId: r.conversaId };
  }

  it("passo 1 dentro da janela de 24h, uma vez só; passo 2 só com modelo; para quando o cliente responde", async () => {
    await configurar({ retomada: { ativo: true, horasPasso1: 20, horasPasso2: 72, modeloPasso2: "" } });
    const canal = new WhatsAppDesligado("teste");
    const a = await conversaSilenciosa(21);
    const recente = await conversaSilenciosa(2);
    await executarRetomadas(canal);
    await executarRetomadas(canal);
    expect(canal.enviados.filter((e) => e.para === a.t).map((e) => e.texto)).toEqual(["Oi, Carla! Conseguiu ver minha última mensagem? Se quiser, te ajudo a escolher o melhor horário."]);
    expect(canal.enviados.filter((e) => e.para === recente.t)).toHaveLength(0);
    // A retomada não conta como "nossa última resposta": não gera outra retomada sobre ela
    expect((await db.select().from(retomada).where(eq(retomada.conversaId, a.conversaId))).map((r) => r.passo)).toEqual([1]);

    // 73h depois, sem modelo configurado: não envia o passo 2 (fora da janela exige modelo)
    const velha = await conversaSilenciosa(73);
    await executarRetomadas(canal);
    expect(canal.modelos.filter((m) => m.para === velha.t)).toHaveLength(0);
    await configurar({ retomada: { ativo: true, horasPasso1: 20, horasPasso2: 72, modeloPasso2: "retomada_contato" } });
    await executarRetomadas(canal);
    expect(canal.modelos.filter((m) => m.para === velha.t)).toEqual([{ para: velha.t, modelo: "retomada_contato", parametros: ["Carla"] }]);

    // Cliente respondeu: nada de retomada
    const respondeu = await conversaSilenciosa(21);
    await registrarMensagemRecebida(extrairMensagens(payload(respondeu.t, "vou ver e te falo"))[0]);
    await executarRetomadas(canal);
    expect(canal.enviados.filter((e) => e.para === respondeu.t)).toHaveLength(0);
  });

  it("não retoma quem pediu para não receber mensagens nem conversa com humano", async () => {
    await configurar({ retomada: { ativo: true } });
    const canal = new WhatsAppDesligado("teste");
    const opt = await conversaSilenciosa(21);
    await db.update(contato).set({ descadastrado: true }).where(eq(contato.telefone, opt.t));
    const hum = await conversaSilenciosa(21);
    await db.update(conversa).set({ situacao: "humano" }).where(eq(conversa.id, hum.conversaId));
    await executarRetomadas(canal);
    expect(canal.enviados.filter((e) => [opt.t, hum.t].includes(e.para))).toHaveLength(0);
  });
});

describe("campanha de reativação", () => {
  it("só envia depois do Go; respeita opt-out; marca quem respondeu", async () => {
    const a = await configurar({ reativacao: { modelo: "" } });
    const csv = (ts: string[]) => "nome;telefone\n" + ts.map((t, i) => `Paciente ${i};${t}`).join("\n");
    expect(await codigo(a.pro.criarCampanha({ nome: "Inativos", csv: csv([tel()]) }))).toBe("BAD_REQUEST"); // sem modelo
    await configurar({ reativacao: { modelo: "reativacao_pacientes" } });
    const [t1, t2, t3] = [tel(), tel(), tel()];
    await db.insert(contato).values({ nome: "Opt-out", telefone: t3, descadastrado: true });
    const c = await a.pro.criarCampanha({ nome: "Inativos 6 meses", csv: csv([t1, t2, t3, t1, "x"]) });
    expect(c.destinatarios).toBe(3); // duplicado removido
    expect(c.erros).toHaveLength(1);

    const canal = new WhatsAppDesligado("teste");
    await executarCampanhas(canal);
    expect(canal.modelos.filter((m) => [t1, t2].includes(m.para))).toHaveLength(0); // rascunho não envia

    const [rasc] = await db.select().from(campanha).where(eq(campanha.id, c.id));
    await a.pro.solicitarEnvio({ id: c.id, versao: rasc.versao });
    await executarCampanhas(canal);
    expect(canal.modelos.filter((m) => [t1, t2].includes(m.para))).toHaveLength(0); // aguardando aprovação

    const pend = (await a.aprovacoes.listar()).itens.find((s) => s.titulo.includes("Inativos 6 meses"))!;
    expect(await codigo((await chamadorComo("gestor")).aprovacoes.decidir({ id: pend.id, versao: pend.versao, decisao: "aprovar" }))).toBe("FORBIDDEN");
    await a.aprovacoes.decidir({ id: pend.id, versao: pend.versao, decisao: "aprovar" });
    await executarCampanhas(canal);
    await executarCampanhas(canal); // conclui
    expect(canal.modelos.filter((m) => [t1, t2, t3].includes(m.para)).map((m) => m.para).sort()).toEqual([t1, t2].sort());
    const dest = await db.select().from(campanhaDestinatario).where(eq(campanhaDestinatario.campanhaId, c.id));
    expect(dest.find((d) => d.telefone === t3)?.situacao).toBe("pulado");
    expect((await db.select().from(campanha).where(eq(campanha.id, c.id)))[0].situacao).toBe("concluida");

    // canal desligado: envio registrado como falha; resposta do paciente marca respondeuEm
    await db.update(campanhaDestinatario).set({ situacao: "enviado" }).where(and(eq(campanhaDestinatario.campanhaId, c.id), eq(campanhaDestinatario.telefone, t1)));
    await registrarMensagemRecebida(extrairMensagens(payload(t1, "oi, quero voltar"))[0]);
    const [d1] = await db.select().from(campanhaDestinatario).where(and(eq(campanhaDestinatario.campanhaId, c.id), eq(campanhaDestinatario.telefone, t1)));
    expect(d1.respondeuEm).not.toBeNull();
  });
});

describe("relatório mensal", () => {
  it("devolve os indicadores do mês e valida o mês", async () => {
    const a = await chamadorComo("admin");
    const r = await a.pro.relatorio({ mes: hojeNoFuso(FUSO).slice(0, 7) });
    expect(r.atendimento.recebidas).toBeGreaterThan(0);
    expect(r.retomada.enviadas).toBeGreaterThanOrEqual(0);
    expect(await codigo(a.pro.relatorio({ mes: "2026-13" }))).toBe("BAD_REQUEST");
    expect(await codigo((await chamadorComo("operador")).pro.relatorio({ mes: "2026-10" }))).toBe("FORBIDDEN");
  });
});
