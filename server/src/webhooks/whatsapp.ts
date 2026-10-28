import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { contato, conversa, etapaPipeline, interacao, mensagem, oportunidade } from "../db/schema.js";
import { emitirEvento } from "../lib/eventos.js";
import { log } from "../lib/log.js";
import { assinaturaValida, json, lerCorpo } from "./captacao.js";

// Formato do webhook da WhatsApp Cloud API (só o que usamos; o resto é ignorado)
const payloadSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    changes: z.array(z.object({
      field: z.string(),
      value: z.object({
        contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).partial().optional() })).optional(),
        messages: z.array(z.object({
          from: z.string(), id: z.string(), timestamp: z.string(), type: z.string(),
          text: z.object({ body: z.string() }).optional(),
        })).optional(),
      }).passthrough(),
    })),
  })),
});

export type MensagemRecebida = { telefone: string; nomePerfil: string | null; idExterno: string; texto: string; recebidaEm: Date };

const TIPOS_SEM_TEXTO: Record<string, string> = { audio: "áudio", image: "imagem", video: "vídeo", document: "documento", sticker: "figurinha", location: "localização", contacts: "contato" };

/** Extrai remetente, texto e horário de cada mensagem do payload. Mensagens sem texto viram um marcador legível. */
export function extrairMensagens(corpo: unknown): MensagemRecebida[] {
  const p = payloadSchema.safeParse(corpo);
  if (!p.success || p.data.object !== "whatsapp_business_account") return [];
  const saida: MensagemRecebida[] = [];
  for (const e of p.data.entry) for (const ch of e.changes) {
    if (ch.field !== "messages") continue;
    const nomes = new Map((ch.value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
    for (const m of ch.value.messages ?? []) {
      const telefone = m.from.replace(/\D/g, "");
      if (!telefone) continue;
      const texto = m.type === "text" && m.text ? m.text.body : `[${TIPOS_SEM_TEXTO[m.type] ?? m.type} enviado pelo cliente; peça para escrever em texto]`;
      const seg = Number(m.timestamp);
      saida.push({ telefone, nomePerfil: nomes.get(m.from) ?? null, idExterno: m.id, texto: texto.slice(0, 4000), recebidaEm: Number.isFinite(seg) ? new Date(seg * 1000) : new Date() });
    }
  }
  return saida;
}

/**
 * Registra a mensagem: identifica o contato pelo número; se não existir, cria o lead na primeira etapa do pipeline.
 * Idempotente pelo id da mensagem no WhatsApp (a Meta reenvia o mesmo webhook em caso de falha).
 */
export async function registrarMensagemRecebida(m: MensagemRecebida) {
  return db.transaction(async (tx) => {
    let [c] = await tx.select({ id: contato.id, nome: contato.nome }).from(contato)
      .where(and(eq(contato.telefone, m.telefone), isNull(contato.arquivadoEm), isNull(contato.anonimizadoEm))).limit(1);
    let leadNovo = false;
    if (!c) {
      const nome = m.nomePerfil?.trim().slice(0, 200) || `Contato WhatsApp final ${m.telefone.slice(-4)}`;
      [c] = await tx.insert(contato).values({ nome, telefone: m.telefone }).returning({ id: contato.id, nome: contato.nome });
      const [etapa] = await tx.select().from(etapaPipeline).where(and(eq(etapaPipeline.ativa, true), eq(etapaPipeline.tipo, "aberta"))).orderBy(asc(etapaPipeline.ordem)).limit(1);
      if (etapa) {
        const [o] = await tx.insert(oportunidade).values({ titulo: `${nome} — WhatsApp`, contatoId: c.id, etapaId: etapa.id, origem: "whatsapp" }).returning();
        await tx.insert(interacao).values({ tipo: "alteracao", descricao: `Lead criado pelo WhatsApp na etapa "${etapa.nome}".`, contatoId: c.id, oportunidadeId: o.id });
        await emitirEvento("oportunidade.criada", { oportunidadeId: o.id }, undefined, tx);
      }
      await emitirEvento("contato.criado", { contatoId: c.id }, undefined, tx);
      leadNovo = true;
    }
    const [conv] = await tx.insert(conversa).values({ canal: "whatsapp", idExterno: m.telefone, nomeExibicao: m.nomePerfil, contatoId: c.id, ultimaMensagemEm: m.recebidaEm })
      .onConflictDoUpdate({
        target: [conversa.canal, conversa.idExterno],
        // Conversa encerrada volta para a IA quando o cliente escreve de novo; em atendimento humano, continua humana
        set: { ultimaMensagemEm: m.recebidaEm, contatoId: sql`coalesce(${conversa.contatoId}, ${c.id})`, situacao: sql`case when ${conversa.situacao} = 'encerrada' then 'ia' else ${conversa.situacao} end` },
      })
      .returning({ id: conversa.id });
    const nova = await tx.insert(mensagem).values({ conversaId: conv.id, autor: "cliente", texto: m.texto, idExterno: m.idExterno, criadoEm: m.recebidaEm })
      .onConflictDoNothing().returning({ id: mensagem.id });
    if (nova.length) await tx.insert(interacao).values({ tipo: "whatsapp", contatoId: c.id, descricao: `WhatsApp · cliente: ${m.texto}`.slice(0, 2000), respostaDoContato: true });
    if (nova.length) await emitirEvento("interacao.resposta_contato", { contatoId: c.id }, `wa:${m.idExterno}`, tx);
    return { conversaId: conv.id, duplicada: !nova.length, leadNovo };
  });
}

const iguais = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/**
 * GET  /webhooks/whatsapp  → verificação da Meta (hub.challenge), com WHATSAPP_VERIFY_TOKEN.
 * POST /webhooks/whatsapp  → mensagens. Exige assinatura X-Hub-Signature-256 (HMAC com WHATSAPP_APP_SECRET).
 * Responde 200 rápido e processa a resposta da IA em seguida (a Meta reenvia se demorar).
 */
export function criarRotaWhatsApp(processarDepois: () => void) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url ?? "/", "http://local");
    if (!/^\/(api\/)?webhooks\/whatsapp\/?$/.test(url.pathname)) return false;
    const reqId = String(res.getHeader("x-request-id") ?? "");
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN, appSecret = process.env.WHATSAPP_APP_SECRET;
    try {
      if (req.method === "GET") {
        const q = url.searchParams;
        if (verifyToken && q.get("hub.mode") === "subscribe" && iguais(q.get("hub.verify_token") ?? "", verifyToken)) {
          res.writeHead(200, { "content-type": "text/plain" }).end(q.get("hub.challenge") ?? "");
        } else res.writeHead(403).end();
        return true;
      }
      if (req.method !== "POST") { res.writeHead(405, { allow: "GET, POST" }).end(); return true; }
      if (!appSecret) { json(res, 503, { erro: "WhatsApp não configurado." }); return true; }
      const corpo = await lerCorpo(req);
      if (!assinaturaValida(appSecret, corpo, req.headers["x-hub-signature-256"] as string | undefined)) { json(res, 401, { erro: "Assinatura inválida." }); return true; }
      let dados: unknown;
      try { dados = JSON.parse(corpo.toString("utf8")); } catch { json(res, 400, { erro: "JSON inválido." }); return true; }
      const msgs = extrairMensagens(dados);
      let novas = 0;
      for (const m of msgs) if (!(await registrarMensagemRecebida(m)).duplicada) novas++;
      log("info", "whatsapp.recebido", { reqId, mensagens: msgs.length, novas });
      json(res, 200, { ok: true });
      if (novas) processarDepois();
    } catch (e) {
      log("erro", "whatsapp.webhook_erro", { reqId, erro: String(e).slice(0, 300) });
      // 500 faz a Meta reenviar; a idempotência evita duplicar
      if (!res.headersSent) json(res, 500, { erro: "Erro interno." });
    }
    return true;
  };
}
