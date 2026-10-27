import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { executarCiclo } from "../automacoes/motor.js";
import { db } from "../db/index.js";
import { contato, empresa, etapaPipeline, evento, interacao, oportunidade, origemCaptacao, tentativaLogin } from "../db/schema.js";
import { hojeNoFuso, obterFuso } from "../lib/datas.js";
import { emitirEvento } from "../lib/eventos.js";
import { ipDoCliente } from "../lib/ip.js";
import { log } from "../lib/log.js";

const LIMITE_CORPO = 64 * 1024;
const LIMITE_FORM_POR_IP = 5; // por origem, a cada 10 minutos

export const leadSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome.").max(200),
    email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200).optional().or(z.literal("").transform(() => undefined)),
    telefone: z.string().trim().max(30).optional(),
    empresa: z.string().trim().max(200).optional(),
    cidade: z.string().trim().max(120).optional(),
    mensagem: z.string().trim().max(2000).optional(),
    idExterno: z.string().trim().max(120).optional(),
  })
  .refine((d) => d.email || d.telefone, "Informe e-mail ou telefone.");
type Lead = z.infer<typeof leadSchema>;

function lerCorpo(req: IncomingMessage): Promise<Buffer> {
  return new Promise((ok, falha) => {
    const partes: Buffer[] = [];
    let total = 0;
    req.on("data", (c: Buffer) => {
      total += c.length;
      if (total > LIMITE_CORPO) { falha(new Error("corpo muito grande")); req.destroy(); return; }
      partes.push(c);
    });
    req.on("end", () => ok(Buffer.concat(partes)));
    req.on("error", falha);
  });
}

const json = (res: ServerResponse, status: number, corpo: unknown, extras: Record<string, string> = {}) =>
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...extras }).end(JSON.stringify(corpo));

export const assinar = (segredo: string, corpo: Buffer | string) => "sha256=" + createHmac("sha256", segredo).update(corpo).digest("hex");

function assinaturaValida(segredo: string, corpo: Buffer, recebida: string | undefined) {
  if (!recebida) return false;
  const esperada = Buffer.from(assinar(segredo, corpo));
  const veio = Buffer.from(recebida.trim());
  return esperada.length === veio.length && timingSafeEqual(esperada, veio);
}

/** Registra o lead: contato (deduplicado por e-mail), empresa (por nome+cidade), oportunidade na etapa da origem. */
export async function registrarLead(origem: typeof origemCaptacao.$inferSelect, lead: Lead, chaveIdempotencia: string) {
  return db.transaction(async (tx) => {
    // O evento com chave única é gravado primeiro: reenvio do mesmo lead não cria nada de novo.
    const novo = await emitirEvento("lead.captado", { origemCaptacaoId: origem.id }, chaveIdempotencia, tx);
    if (!novo) return { duplicado: true as const };

    const [etapa] = await tx.select().from(etapaPipeline).where(eq(etapaPipeline.id, origem.etapaId));
    let empresaId: string | null = null;
    if (lead.empresa) {
      const [e] = await tx.select({ id: empresa.id }).from(empresa)
        .where(sql`lower(${empresa.nome}) = lower(${lead.empresa}) and lower(coalesce(${empresa.cidade}, '')) = lower(${lead.cidade ?? ""})`);
      empresaId = e?.id ?? (await tx.insert(empresa).values({ nome: lead.empresa, cidade: lead.cidade || null }).returning({ id: empresa.id }))[0].id;
    }
    let contatoId: string;
    const [existente] = lead.email ? await tx.select({ id: contato.id, empresaId: contato.empresaId }).from(contato).where(eq(contato.email, lead.email)) : [];
    if (existente) contatoId = existente.id;
    else contatoId = (await tx.insert(contato).values({ nome: lead.nome, email: lead.email ?? null, telefone: lead.telefone ?? null, empresaId }).returning({ id: contato.id }))[0].id;

    const [o] = await tx
      .insert(oportunidade)
      .values({ titulo: `${lead.nome} — ${origem.nome}`, empresaId: empresaId ?? existente?.empresaId ?? null, contatoId, etapaId: etapa.id, situacao: "aberta", origem: origem.origemRotulo })
      .returning();
    await tx.insert(interacao).values({
      tipo: "alteracao",
      descricao: `Lead recebido pela origem "${origem.nome}".${lead.mensagem ? `\nMensagem: ${lead.mensagem}` : ""}`,
      oportunidadeId: o.id, empresaId: o.empresaId, contatoId,
    });
    // Completa o payload do evento com os vínculos (para condições e ações das automações)
    await tx.update(evento).set({ payload: { origemCaptacaoId: origem.id, oportunidadeId: o.id, contatoId, empresaId: o.empresaId } }).where(eq(evento.chaveIdempotencia, chaveIdempotencia));
    await emitirEvento("oportunidade.criada", { oportunidadeId: o.id, etapaId: etapa.id }, undefined, tx);
    await tx.update(origemCaptacao).set({ recebidos: sql`${origemCaptacao.recebidos} + 1`, ultimoRecebimentoEm: new Date() }).where(eq(origemCaptacao.id, origem.id));
    return { duplicado: false as const, oportunidadeId: o.id };
  });
}

async function carregarOrigem(id: string, modo: "hmac" | "publico") {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [o] = await db.select().from(origemCaptacao).where(and(eq(origemCaptacao.id, id), eq(origemCaptacao.modo, modo), eq(origemCaptacao.ativa, true)));
  return o ?? null;
}

const processarDepois = (reqId: string) => executarCiclo({ limite: 20 }).catch((e) => log("erro", "automacao.ciclo_webhook", { reqId, erro: String(e) }));

/** POST /webhooks/captacao/:id: servidor a servidor, com assinatura HMAC-SHA256 em X-Assinatura. */
async function webhookAssinado(req: IncomingMessage, res: ServerResponse, id: string, reqId: string) {
  if (req.method !== "POST") return json(res, 405, { erro: "Use POST." });
  const origem = await carregarOrigem(id, "hmac");
  if (!origem?.segredo) return json(res, 404, { erro: "Origem inexistente ou desativada." });
  let corpo: Buffer;
  try { corpo = await lerCorpo(req); } catch { return json(res, 413, { erro: "Corpo maior que 64 KB." }); }
  if (!assinaturaValida(origem.segredo, corpo, req.headers["x-assinatura"] as string | undefined)) {
    log("aviso", "webhook.assinatura_invalida", { reqId, origemId: id });
    return json(res, 401, { erro: "Assinatura inválida." });
  }
  let dados: unknown;
  try { dados = JSON.parse(corpo.toString("utf8")); } catch { return json(res, 400, { erro: "JSON inválido." }); }
  const lead = leadSchema.safeParse(dados);
  if (!lead.success) return json(res, 422, { erro: "Dados inválidos.", campos: z.flattenError(lead.error).fieldErrors });
  // Idempotência: X-Id-Evento (ou idExterno) identifica o envio; sem ele, usa o hash do corpo.
  const idEnvio = (req.headers["x-id-evento"] as string | undefined)?.slice(0, 120) || lead.data.idExterno || createHash("sha256").update(corpo).digest("hex");
  const r = await registrarLead(origem, lead.data, `captacao:${origem.id}:${idEnvio}`);
  log("info", "webhook.lead", { reqId, origemId: id, duplicado: r.duplicado });
  if (!r.duplicado) await processarDepois(reqId);
  return json(res, r.duplicado ? 200 : 201, r);
}

/** POST /webhooks/formulario/:id: formulário público do site (CORS, limite por IP, campo-armadilha). */
async function formularioPublico(req: IncomingMessage, res: ServerResponse, id: string, reqId: string) {
  const origem = await carregarOrigem(id, "publico");
  const origemReq = req.headers.origin;
  const cors: Record<string, string> = {
    "access-control-allow-origin": origem?.dominioPermitido ?? "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  if (req.method !== "POST") return json(res, 405, { erro: "Use POST." }, cors);
  if (!origem) return json(res, 404, { erro: "Formulário indisponível." }, cors);
  if (origem.dominioPermitido && origemReq && origemReq !== origem.dominioPermitido) return json(res, 403, { erro: "Domínio não autorizado." }, cors);

  const ip = ipDoCliente(req);
  const chaveIp = `form:${origem.id}:${ip}`;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(tentativaLogin).where(and(eq(tentativaLogin.chave, chaveIp), gte(tentativaLogin.criadoEm, new Date(Date.now() - 10 * 60_000))));
  if (n >= LIMITE_FORM_POR_IP) return json(res, 429, { erro: "Muitos envios. Tente mais tarde." }, cors);
  await db.insert(tentativaLogin).values({ chave: chaveIp, sucesso: true });

  let corpo: Buffer;
  try { corpo = await lerCorpo(req); } catch { return json(res, 413, { erro: "Envio muito grande." }, cors); }
  const tipo = req.headers["content-type"] ?? "";
  let dados: Record<string, unknown>;
  try {
    dados = tipo.includes("application/json") ? JSON.parse(corpo.toString("utf8")) : Object.fromEntries(new URLSearchParams(corpo.toString("utf8")));
  } catch { return json(res, 400, { erro: "Formato inválido." }, cors); }
  // Campo-armadilha invisível para pessoas: se vier preenchido, é robô. Responde "ok" sem gravar.
  if (typeof dados.website === "string" && dados.website.trim()) {
    log("aviso", "formulario.robo", { reqId, origemId: id });
    return json(res, 200, { ok: true }, cors);
  }
  const lead = leadSchema.safeParse(dados);
  if (!lead.success) return json(res, 422, { erro: "Confira os campos.", campos: z.flattenError(lead.error).fieldErrors }, cors);
  // Mesmo lead (e-mail ou telefone) na mesma origem e no mesmo dia: não duplica.
  const quem = (lead.data.email ?? lead.data.telefone ?? "").toLowerCase().replace(/\s/g, "");
  const r = await registrarLead(origem, { ...lead.data, idExterno: undefined }, `form:${origem.id}:${quem}:${hojeNoFuso(await obterFuso())}`);
  log("info", "formulario.lead", { reqId, origemId: id, duplicado: r.duplicado });
  if (!r.duplicado) await processarDepois(reqId);
  // Não revela ao público se era duplicado
  return json(res, 201, { ok: true }, cors);
}

export async function rotaWebhooks(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://local");
  const m = url.pathname.match(/^\/webhooks\/(captacao|formulario)\/([^/]+)\/?$/);
  if (!m) return false;
  const reqId = String(res.getHeader("x-request-id") ?? "");
  try {
    if (m[1] === "captacao") await webhookAssinado(req, res, m[2], reqId);
    else await formularioPublico(req, res, m[2], reqId);
  } catch (e) {
    log("erro", "webhook.erro", { reqId, erro: String(e) });
    if (!res.headersSent) json(res, 500, { erro: "Erro interno. Tente novamente." });
  }
  return true;
}
