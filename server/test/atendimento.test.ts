import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { and, eq, like } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { agente, contato, conversa, etapaPipeline, execucaoAgente, mensagem, oportunidade, solicitacaoAprovacao, tarefa } from "../src/db/schema.js";
import { criarServidor } from "../src/app.js";
import { rotear } from "../src/services/agentRouter.js";
import { dispararAtendimento } from "../src/services/container.js";
import { processarConversa, processarFila, type DepsAtendimento } from "../src/services/atendimentoService.js";
import { buscarContextoCRM, buscarHistorico, formatarContexto } from "../src/services/contextService.js";
import { ErroLLM, type PedidoLLM, type ProvedorLLM, type SaidaAgente } from "../src/services/llmService.js";
import { WhatsAppDesligado } from "../src/services/whatsappService.js";
import { ErroTranscricao, type Transcritor } from "../src/services/transcricaoService.js";
import { consumoUso } from "../src/db/schema.js";
import { extrairMensagens, registrarMensagemRecebida } from "../src/webhooks/whatsapp.js";
import { chamadorComo, prepararBase } from "./utils.js";

/** LLM de mentira: devolve a saída programada e guarda o que recebeu. */
class LLMFalso implements ProvedorLLM {
  pedidos: PedidoLLM[] = [];
  constructor(public saida: SaidaAgente | Error = { resposta: "Olá! Qual o principal desafio hoje?", acoes: [] }) {}
  async gerar(p: PedidoLLM) {
    this.pedidos.push(p);
    await new Promise((r) => setTimeout(r, 20));
    if (this.saida instanceof Error) throw this.saida;
    return { saida: this.saida, tokensEntrada: 1200, tokensSaida: 80, modeloUsado: p.modelo };
  }
}
const acao = (tipo: SaidaAgente["acoes"][number]["tipo"], extra: Partial<SaidaAgente["acoes"][number]> = {}) => ({ tipo, descricao: null, percentual: null, valor: null, ...extra });
let seq = 0;
const telefone = () => `55119${String(Date.now()).slice(-6)}${seq++}`;
const payload = (tel: string, texto: string, id = `wamid.${tel}.${seq++}`, nome = "Maria Teste") => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: tel, profile: { name: nome } }], messages: [{ from: tel, id, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } }] } }] }],
});
/** Transcritor de mentira: devolve o texto programado (ou falha) e guarda o que recebeu. */
class TranscritorFalso implements Transcritor {
  recebidos: { bytes: number; mime: string }[] = [];
  constructor(public texto: string | Error = "quero saber o preço do plano") {}
  async transcrever(audio: Buffer, mime: string) {
    this.recebidos.push({ bytes: audio.length, mime });
    if (this.texto instanceof Error) throw this.texto;
    return { texto: this.texto, segundos: 7 };
  }
}
function deps(llm: ProvedorLLM, transcritor: Transcritor = new TranscritorFalso()) {
  const canal = new WhatsAppDesligado("teste");
  return { canal, d: { provedores: { anthropic: llm }, canal, transcritor, modeloPadrao: "claude-opus-5-5" } satisfies DepsAtendimento };
}
const payloadAudio = (tel: string, midiaId: string) => ({
  object: "whatsapp_business_account",
  entry: [{ changes: [{ field: "messages", value: { contacts: [{ wa_id: tel, profile: { name: "Cliente Áudio" } }], messages: [{ from: tel, id: `wamid.audio.${midiaId}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "audio", audio: { id: midiaId, mime_type: "audio/ogg; codecs=opus" } }] } }] }],
});
async function ativarAgentes() {
  for (const area of ["marketing", "comercial", "cs"] as const) {
    const [a] = await db.select().from(agente).where(eq(agente.area, area)).limit(1);
    if (a) await db.update(agente).set({ ativo: true }).where(eq(agente.id, a.id));
    else await db.insert(agente).values({ nome: `Agente ${area} (teste atendimento)`, area, systemPrompt: `prompt ${area}`, modelo: "claude-opus-5-5", ativo: true });
  }
}
async function novaConversa(texto = "Oi, quero saber mais") {
  const tel = telefone();
  const r = await registrarMensagemRecebida(extrairMensagens(payload(tel, texto))[0]);
  return { tel, conversaId: r.conversaId };
}

beforeAll(prepararBase);

describe("roteador", () => {
  const op = (etapa: string, ordem: number, situacao = "aberta") => ({ id: "x", versao: 1, titulo: "t", etapa, etapaOrdem: ordem, valor: "0", situacao });
  const c = { plano: "Pro", valorMensal: "100", inicio: "2025-01-01", fim: null };
  it("decide pela etapa e pelo contrato ativo", () => {
    expect(rotear({ contratosAtivos: [], oportunidade: null }).area).toBe("marketing");
    expect(rotear({ contratosAtivos: [], oportunidade: op("Lead", 1) }).area).toBe("marketing");
    expect(rotear({ contratosAtivos: [], oportunidade: op("Contato feito", 2) }).area).toBe("marketing");
    expect(rotear({ contratosAtivos: [], oportunidade: op("Demonstração", 3) }).area).toBe("comercial");
    expect(rotear({ contratosAtivos: [], oportunidade: op("Proposta", 4) }).area).toBe("comercial");
    expect(rotear({ contratosAtivos: [c], oportunidade: op("Proposta", 4) }).area).toBe("cs"); // pós-venda vence o funil
    expect(rotear({ contratosAtivos: [], oportunidade: op("Negociação", 5) }).area).toBe("comercial");
  });
});

describe("webhook do WhatsApp", () => {
  it("número novo vira contato + oportunidade na primeira etapa; mensagem repetida não duplica", async () => {
    const tel = telefone();
    const p = payload(tel, "Quero um orçamento", "wamid.dup.1");
    const r1 = await registrarMensagemRecebida(extrairMensagens(p)[0]);
    const r2 = await registrarMensagemRecebida(extrairMensagens(p)[0]);
    expect(r1).toMatchObject({ leadNovo: true, duplicada: false });
    expect(r2).toMatchObject({ duplicada: true, conversaId: r1.conversaId });
    const [c] = await db.select().from(contato).where(eq(contato.telefone, tel));
    expect(c.nome).toBe("Maria Teste");
    const [o] = await db.select({ etapa: etapaPipeline.ordem, origem: oportunidade.origem }).from(oportunidade).innerJoin(etapaPipeline, eq(etapaPipeline.id, oportunidade.etapaId)).where(eq(oportunidade.contatoId, c.id));
    expect(o).toMatchObject({ etapa: 1, origem: "whatsapp" });
    // Segunda mensagem do mesmo número: mesmo contato, sem novo lead
    const r3 = await registrarMensagemRecebida(extrairMensagens(payload(tel, "Alô?"))[0]);
    expect(r3).toMatchObject({ leadNovo: false, conversaId: r1.conversaId });
    expect(await db.select().from(mensagem).where(eq(mensagem.conversaId, r1.conversaId))).toHaveLength(2);
  });

  it("HTTP: verificação da Meta, assinatura obrigatória e 200 com assinatura válida", async () => {
    process.env.WHATSAPP_APP_SECRET = "segredo-teste";
    process.env.WHATSAPP_VERIFY_TOKEN = "token-verificacao";
    const srv = criarServidor().listen(0);
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    try {
      const ok = await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=token-verificacao&hub.challenge=42`);
      expect([ok.status, await ok.text()]).toEqual([200, "42"]);
      expect((await fetch(`${base}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42`)).status).toBe(403);
      const corpo = JSON.stringify(payload(telefone(), "Oi"));
      expect((await fetch(`${base}/webhooks/whatsapp`, { method: "POST", body: corpo, headers: { "x-hub-signature-256": "sha256=00" } })).status).toBe(401);
      const assinatura = "sha256=" + createHmac("sha256", "segredo-teste").update(corpo).digest("hex");
      expect((await fetch(`${base}/api/webhooks/whatsapp`, { method: "POST", body: corpo, headers: { "x-hub-signature-256": assinatura } })).status).toBe(200);
    } finally {
      // O webhook dispara o atendimento em segundo plano: espera terminar para não interferir nos próximos testes
      await dispararAtendimento();
      srv.close();
      delete process.env.WHATSAPP_APP_SECRET;
      delete process.env.WHATSAPP_VERIFY_TOKEN;
    }
  });
});

describe("memória (contexto)", () => {
  it("monta histórico das últimas 15 mensagens e o bloco do CRM com etapa e planos", async () => {
    const { conversaId } = await novaConversa("mensagem 0");
    await db.insert(mensagem).values(Array.from({ length: 20 }, (_, i) => ({ conversaId, autor: i % 2 ? "ia" : "cliente", texto: `m${i + 1}`, criadoEm: new Date(Date.now() + i * 1000), processadaEm: new Date() })));
    const h = await buscarHistorico(conversaId);
    expect(h).toHaveLength(15);
    expect(h[h.length - 1]).toEqual({ papel: "agente", texto: "m20" });
    const a = await chamadorComo("admin");
    await a.planos.criar({ nome: `Plano Ctx ${seq++}`, valorMensal: "499" });
    const texto = formatarContexto(await buscarContextoCRM(conversaId), "2026-10-28");
    expect(texto).toContain('etapa "Lead"');
    expect(texto).toContain("R$ 499,00/mês");
    expect(texto).not.toMatch(/55119\d+/); // telefone não vai para o prompt
    expect(texto).toContain("Base de conhecimento da empresa: vazia");
    await a.agentes.salvarBaseConhecimento({ texto: "Garantia de 30 dias." });
    expect(formatarContexto(await buscarContextoCRM(conversaId), "2026-10-28")).toContain("Garantia de 30 dias.");
    expect(await (await chamadorComo("operador")).agentes.salvarBaseConhecimento({ texto: "x" }).then(() => "OK", (e) => e.code)).toBe("FORBIDDEN");
  });
});

describe("atendimento", () => {
  it("sem agente ativo: cliente recebe a mensagem padrão e a conversa vai para humano", async () => {
    await db.update(agente).set({ ativo: false });
    const { conversaId } = await novaConversa();
    const llm = new LLMFalso();
    const { canal, d } = deps(llm);
    await processarConversa(conversaId, d);
    expect(llm.pedidos).toHaveLength(0);
    expect(canal.enviados.map((e) => e.texto)).toEqual(["Recebemos sua mensagem! Um especialista da nossa equipe vai te responder em instantes."]);
    const [c] = await db.select().from(conversa).where(eq(conversa.id, conversaId));
    expect(c.situacao).toBe("humano");
    // O agente padrão da área foi criado (inativo) para o estrategista revisar
    expect((await db.select().from(agente).where(eq(agente.area, "marketing"))).length).toBeGreaterThan(0);
  });

  it("SDR responde, grava, envia e registra execução; lead qualificado vai para Demonstração", async () => {
    await ativarAgentes();
    const { tel, conversaId } = await novaConversa("Tenho 3 lojas e perco clientes no WhatsApp, orçamento 500/mês, quero resolver este mês");
    const llm = new LLMFalso({ resposta: "Perfeito! Um especialista vai assumir seu atendimento.", acoes: [acao("qualificado", { descricao: "3 lojas, R$500/mês, este mês" })] });
    const { canal, d } = deps(llm);
    await processarFila(d);
    expect(llm.pedidos[0].system).toMatch(/SDR autônomo|prompt marketing/); // prompt padrão ou o cadastrado
    expect(llm.pedidos[0].contexto).toContain('etapa "Lead"');
    expect(llm.pedidos[0].system).toContain("Regras obrigatórias");
    expect(canal.enviados.filter((e) => e.para === tel)).toEqual([{ para: tel, texto: "Perfeito! Um especialista vai assumir seu atendimento." }]);
    const msgs = await db.select().from(mensagem).where(eq(mensagem.conversaId, conversaId));
    expect(msgs.find((m) => m.autor === "cliente")?.processadaEm).not.toBeNull();
    expect(msgs.find((m) => m.autor === "ia")).toMatchObject({ erroEnvio: "teste" }); // canal desligado: registrado, não enviado
    const ctx = await buscarContextoCRM(conversaId);
    expect(ctx.oportunidade?.etapa).toBe("Demonstração");
    const [ex] = await db.select().from(execucaoAgente).where(like(execucaoAgente.resumo, "%movido para Demonstração%"));
    expect(ex).toMatchObject({ situacao: "ok", tokensEntrada: 1200, tokensSaida: 80 });
  });

  it("Closer: desconto até 10% passa; acima disso vira aprovação e a resposta é trocada", async () => {
    await ativarAgentes();
    const { conversaId } = await novaConversa();
    const [demo] = await db.select().from(etapaPipeline).where(eq(etapaPipeline.nome, "Demonstração"));
    const ctx = await buscarContextoCRM(conversaId);
    await db.update(oportunidade).set({ etapaId: demo.id }).where(eq(oportunidade.id, ctx.oportunidade!.id));

    const ok = new LLMFalso({ resposta: "Consigo 8% no anual.", acoes: [acao("oferecer_desconto", { percentual: 8 })] });
    const r1 = deps(ok);
    await processarConversa(conversaId, r1.d);
    expect(r1.canal.enviados[0].texto).toBe("Consigo 8% no anual.");

    await registrarMensagemRecebida(extrairMensagens(payload((await db.select().from(conversa).where(eq(conversa.id, conversaId)))[0].idExterno, "E 20%?"))[0]);
    const alto = new LLMFalso({ resposta: "Fechado, 20% para você!", acoes: [acao("oferecer_desconto", { percentual: 20, descricao: "pediu 20%" })] });
    const r2 = deps(alto);
    await processarConversa(conversaId, r2.d);
    expect(r2.canal.enviados[0].texto).not.toContain("20%");
    expect(r2.canal.enviados[0].texto).toContain("aprovação");
    const [s] = await db.select().from(solicitacaoAprovacao).where(like(solicitacaoAprovacao.titulo, "Desconto de 20%%"));
    expect(s).toMatchObject({ tipo: "desconto", situacao: "pendente" });
  });

  it("IA fora do ar: fallback, conversa para humano, tarefa e execução com erro", async () => {
    await ativarAgentes();
    const { conversaId } = await novaConversa();
    const { canal, d } = deps(new LLMFalso(new ErroLLM("API indisponível (529)", true)));
    await processarConversa(conversaId, d);
    expect(canal.enviados[0].texto).toContain("Um especialista");
    expect((await db.select().from(conversa).where(eq(conversa.id, conversaId)))[0].situacao).toBe("humano");
    expect((await db.select().from(tarefa).where(eq(tarefa.titulo, "WhatsApp aguardando atendimento humano"))).length).toBeGreaterThan(0);
    expect((await db.select().from(execucaoAgente).where(and(eq(execucaoAgente.situacao, "erro"), like(execucaoAgente.erro, "%529%")))).length).toBe(1);
    // Em atendimento humano a IA não responde mais
    const llm = new LLMFalso();
    await registrarMensagemRecebida(extrairMensagens(payload((await db.select().from(conversa).where(eq(conversa.id, conversaId)))[0].idExterno, "Alguém aí?"))[0]);
    await processarConversa(conversaId, deps(llm).d);
    expect(llm.pedidos).toHaveLength(0);
  });

  it("franquia esgotada com bloqueio: não chama a IA e usa o fallback", async () => {
    await ativarAgentes();
    const a = await chamadorComo("admin");
    await a.admin.salvarLimites({ ia_conversa: 0, ia_tokens: null, whatsapp_conversa: null, bloquearAoAtingir: true });
    try {
      const { conversaId } = await novaConversa();
      const llm = new LLMFalso();
      const { canal, d } = deps(llm);
      await processarConversa(conversaId, d);
      expect(llm.pedidos).toHaveLength(0);
      expect(canal.enviados).toHaveLength(1);
      expect((await db.select().from(execucaoAgente).where(eq(execucaoAgente.situacao, "bloqueada"))).length).toBeGreaterThan(0);
    } finally {
      await a.admin.salvarLimites({ ia_conversa: null, ia_tokens: null, whatsapp_conversa: null, bloquearAoAtingir: false });
    }
  });

  it("áudio: ChatGPT transcreve, Claude responde com base no texto, consumo registrado", async () => {
    await ativarAgentes();
    const tel = telefone();
    const r = await registrarMensagemRecebida(extrairMensagens(payloadAudio(tel, "midia-ok"))[0]);
    const llm = new LLMFalso({ resposta: "Claro! Me conta quantos atendimentos vocês fazem por mês?", acoes: [] });
    const transcritor = new TranscritorFalso("quero saber o preço do plano");
    const { canal, d } = deps(llm, transcritor);
    canal.midias.set("midia-ok", { dados: Buffer.alloc(14_000, 1), mime: "audio/ogg; codecs=opus" });
    await processarConversa(r.conversaId, d);
    expect(transcritor.recebidos).toEqual([{ bytes: 14_000, mime: "audio/ogg; codecs=opus" }]);
    const [m] = await db.select().from(mensagem).where(and(eq(mensagem.conversaId, r.conversaId), eq(mensagem.autor, "cliente")));
    expect(m.texto).toBe("[áudio transcrito] quero saber o preço do plano");
    expect(m.transcritaEm).not.toBeNull();
    expect(llm.pedidos[0].historico.at(-1)).toEqual({ papel: "cliente", texto: "[áudio transcrito] quero saber o preço do plano" });
    expect(canal.enviados.at(-1)?.texto).toContain("quantos atendimentos");
    const [c] = await db.select().from(consumoUso).where(and(eq(consumoUso.recurso, "transcricao_segundos"), eq(consumoUso.referencia, m.id)));
    expect(c.quantidade).toBe(7);
  });

  it("áudio que não transcreve: o agente responde pedindo texto (cliente não fica sem resposta)", async () => {
    await ativarAgentes();
    const r = await registrarMensagemRecebida(extrairMensagens(payloadAudio(telefone(), "midia-falha"))[0]);
    const llm = new LLMFalso({ resposta: "Não consegui ouvir seu áudio, pode escrever?", acoes: [] });
    const { canal, d } = deps(llm, new TranscritorFalso(new ErroTranscricao("OpenAI indisponível (503)", true)));
    canal.midias.set("midia-falha", { dados: Buffer.alloc(100), mime: "audio/ogg" });
    await processarConversa(r.conversaId, d);
    expect(llm.pedidos[0].historico.at(-1)?.texto).toContain("não pôde ser transcrito");
    expect(canal.enviados.at(-1)?.texto).toBe("Não consegui ouvir seu áudio, pode escrever?");
  });

  it("duas execuções em paralelo respondem a conversa uma vez só", async () => {
    await ativarAgentes();
    await novaConversa();
    const llm = new LLMFalso();
    const { d } = deps(llm);
    await Promise.all([processarFila(d), processarFila(d)]);
    const pendentes = await db.select().from(mensagem).where(and(eq(mensagem.autor, "cliente"), eq(mensagem.tentativas, 0)));
    expect(pendentes.every((m) => m.processadaEm !== null)).toBe(true);
    const respostas = llm.pedidos.length;
    expect(respostas).toBeGreaterThan(0);
    await processarFila(d);
    expect(llm.pedidos.length).toBe(respostas); // nada pendente: nenhuma chamada nova
  });
});

