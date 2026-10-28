import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { agente, conversa, unidade } from "../src/db/schema.js";
import { hojeNoFuso } from "../src/lib/datas.js";
import { instanteLocal } from "../src/router/operacao/pro.js";
import { processarConversa, type DepsAtendimento } from "../src/services/atendimentoService.js";
import type { PedidoLLM, ProvedorLLM } from "../src/services/llmService.js";
import { enviarLembretes } from "../src/services/recursosProService.js";
import { WhatsAppDesligado } from "../src/services/whatsappService.js";
import { extrairMensagens, registrarMensagemRecebida } from "../src/webhooks/whatsapp.js";
import { chamadorComo, prepararBase } from "./utils.js";

const codigo = async (p: Promise<unknown>) => { try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; } };
const FUSO = "America/Sao_Paulo";
let seq = 0;
const tel = () => `55319${String(Date.now()).slice(-6)}${seq++}`;
const ddmmaaaa = (iso: string) => iso.split("-").reverse().join("/");
const somaDias = (iso: string, n: number) => { const [a, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const payload = (t: string, texto: string, numeroId?: string) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { ...(numeroId ? { metadata: { phone_number_id: numeroId } } : {}), contacts: [{ wa_id: t, profile: { name: "Paula Rede" } }], messages: [{ from: t, id: `wamid.rede.${seq++}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } }] } }] }],
});
class LLMFalso implements ProvedorLLM {
  pedidos: PedidoLLM[] = [];
  async gerar(p: PedidoLLM) { this.pedidos.push(p); return { saida: { resposta: "Olá! Como posso ajudar?", acoes: [] }, tokensEntrada: 1, tokensSaida: 1, modeloUsado: p.modelo }; }
}

let centro: { id: string; numeroId: string }, sul: { id: string; numeroId: string };

beforeAll(async () => {
  await prepararBase();
  await db.delete(unidade);
  for (const area of ["marketing", "comercial", "cs"] as const)
    await db.insert(agente).values({ nome: `Agente ${area} (teste rede)`, area, systemPrompt: "p", modelo: "claude-opus-5-5", ativo: true }).onConflictDoNothing();
});

describe("unidades", () => {
  it("só admin cadastra; valida o número; limite de 3 ativas; número único", async () => {
    const a = await chamadorComo("admin");
    expect(await codigo((await chamadorComo("gestor")).unidades.salvar({ nome: "X", numeroId: "100000001" }))).toBe("FORBIDDEN");
    expect(await codigo(a.unidades.salvar({ nome: "X", numeroId: "abc" }))).toBe("BAD_REQUEST");
    centro = await a.unidades.salvar({ nome: "Centro", numeroId: "100000001", informacoes: "Rua A, 100. Seg a sex, 8h às 19h." });
    sul = await a.unidades.salvar({ nome: "Zona Sul", numeroId: "100000002", informacoes: "Av. B, 200. Sábados até 13h." });
    const terceira = await a.unidades.salvar({ nome: "Norte", numeroId: "100000003" });
    expect(await codigo(a.unidades.salvar({ nome: "Quarta", numeroId: "100000004" }))).toBe("BAD_REQUEST");
    expect(await codigo(a.unidades.salvar({ nome: "Outra", numeroId: "100000001", ativa: false }))).toBe("CONFLICT");
    await a.unidades.salvar({ id: terceira.id, versao: terceira.versao, nome: "Norte", numeroId: "100000003", ativa: false });
    const quarta = await a.unidades.salvar({ nome: "Quarta", numeroId: "100000004" }); // vaga liberada
    expect(quarta.ativa).toBe(true);
    await a.unidades.salvar({ id: quarta.id, versao: quarta.versao, nome: "Quarta", numeroId: "100000004", ativa: false });
  });
});

describe("atendimento por unidade", () => {
  it("cada unidade tem sua conversa; resposta sai pelo número da unidade com as informações dela", async () => {
    const t = tel();
    const r1 = await registrarMensagemRecebida(extrairMensagens(payload(t, "qual o endereço?", centro.numeroId))[0]);
    const r2 = await registrarMensagemRecebida(extrairMensagens(payload(t, "abre sábado?", sul.numeroId))[0]);
    expect(r1.conversaId).not.toBe(r2.conversaId);
    const [c2] = await db.select().from(conversa).where(eq(conversa.id, r2.conversaId));
    expect(c2.unidadeId).toBe(sul.id);

    const llm = new LLMFalso();
    const canal = new WhatsAppDesligado("teste");
    const d: DepsAtendimento = { provedores: { anthropic: llm }, canal, transcritor: { transcrever: async () => ({ texto: "", segundos: 0 }) }, modeloPadrao: "claude-opus-5-5" };
    await processarConversa(r2.conversaId, d);
    expect(llm.pedidos[0].contexto).toContain("Unidade em atendimento: Zona Sul");
    expect(llm.pedidos[0].contexto).toContain("Sábados até 13h");
    expect(canal.enviados.at(-1)).toMatchObject({ para: t, de: sul.numeroId });

    // Número desconhecido (ou sem metadado) = número principal
    const r3 = await registrarMensagemRecebida(extrairMensagens(payload(t, "oi"))[0]);
    expect((await db.select().from(conversa).where(eq(conversa.id, r3.conversaId)))[0].unidadeId).toBeNull();
  });

  it("agenda por unidade: importação com coluna de unidade, lembrete pelo número da unidade, filtro", async () => {
    const a = await chamadorComo("admin");
    await a.pro.salvarConfiguracao({ idiomaModelos: "pt_BR", retomada: {}, confirmacao: { ativo: true, horaEnvio: 10, modelo: "confirmacao_consulta" }, reativacao: {} } as never);
    const hoje = hojeNoFuso(FUSO);
    const amanha = ddmmaaaa(somaDias(hoje, 1));
    const [t1, t2] = [tel(), tel()];
    const csv = `nome;telefone;data;hora;procedimento;profissional;unidade\nAna;${t1};${amanha};09:00;Peeling;;Zona Sul\nBia;${t2};${amanha};10:00;Laser;;centro\nCaio;${tel()};${amanha};11:00;x;;Inexistente`;
    const r = await a.pro.importarAgenda({ csv, aplicar: true });
    expect(r.importadas).toBe(2);
    expect(r.erros).toEqual([{ linha: 4, erro: 'Unidade "Inexistente" não cadastrada.' }]);
    const deAmanha = { de: somaDias(hoje, 1), ate: somaDias(hoje, 1) };
    expect((await a.pro.agenda({ ...deAmanha, unidadeId: sul.id })).map((x) => x.nome)).toEqual(["Ana"]);

    const canal = new WhatsAppDesligado("teste");
    await enviarLembretes(canal, instanteLocal(ddmmaaaa(hoje), "10:30", FUSO)!);
    expect(canal.modelos.find((m) => m.para === t1)?.de).toBe(sul.numeroId);
    expect(canal.modelos.find((m) => m.para === t2)?.de).toBe(centro.numeroId);
  });

  it("relatório semanal e por unidade", async () => {
    const a = await chamadorComo("admin");
    const hoje = hojeNoFuso(FUSO);
    const semana = { de: somaDias(hoje, -6), ate: hoje };
    const geral = await a.pro.relatorio(semana);
    const soSul = await a.pro.relatorio({ ...semana, unidadeId: sul.id });
    expect(soSul.atendimento.recebidas).toBeGreaterThan(0);
    expect(soSul.atendimento.recebidas).toBeLessThan(geral.atendimento.recebidas);
    expect(await codigo(a.pro.relatorio({ de: hoje, ate: somaDias(hoje, -1) }))).toBe("BAD_REQUEST");
  });
});
