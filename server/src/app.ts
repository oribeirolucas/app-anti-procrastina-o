import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router/index.js";
import { criarContexto } from "./router/trpc.js";
import { env } from "./lib/env.js";
import { pool } from "./db/index.js";
import { log } from "./lib/log.js";
import { rotaWebhooks } from "./webhooks/captacao.js";
import { executarCiclo } from "./automacoes/motor.js";
import { timingSafeEqual } from "node:crypto";

const trpc = createHTTPHandler({ router: appRouter, createContext: criarContexto, basePath: "/trpc/" });

const PASTA_CLIENT = path.resolve(process.env.PASTA_CLIENT ?? "../client/dist");
const TIPOS: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };

export type Rota = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean>;
const rotasExtras: Rota[] = [];
export const registrarRota = (r: Rota) => rotasExtras.push(r);

function cabecalhosSeguranca(res: http.ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
  if (env.producao) res.setHeader("Strict-Transport-Security", "max-age=31536000");
}

// Requisições que alteram estado precisam vir da própria aplicação (proteção CSRF).
function origemValida(req: http.IncomingMessage): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origem = req.headers.origin;
  if (!origem) return !env.producao; // ferramentas locais/testes sem navegador
  const host = req.headers.host;
  return origem === env.origemApp || (host !== undefined && new URL(origem).host === host);
}

// Tratador único de requisições: usado pelo servidor Node (VPS/Docker) e pela função serverless (Vercel).
export async function tratarRequisicao(req: http.IncomingMessage, res: http.ServerResponse) {
  {
    cabecalhosSeguranca(res);
    // Identificador da requisição: devolvido ao cliente e presente em todos os logs dela
    const reqId = randomUUID();
    res.setHeader("x-request-id", reqId);
    const inicio = Date.now();
    const url = new URL(req.url ?? "/", "http://local");
    if (url.pathname.startsWith("/trpc/") || url.pathname.startsWith("/webhooks/"))
      res.on("finish", () => log(res.statusCode >= 500 ? "erro" : "info", "http", { reqId, metodo: req.method, rota: url.pathname, status: res.statusCode, ms: Date.now() - inicio }));
    try {
      if (url.pathname === "/saude") {
        // Saúde: processo vivo + banco respondendo. 503 indica que precisa de intervenção.
        try {
          await pool.query("select 1");
          res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, banco: "ok" }));
        } catch (e) {
          log("erro", "saude.banco_indisponivel", { reqId, erro: String(e) });
          res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, banco: "indisponivel" }));
        }
        return;
      }
      for (const rota of rotasExtras) if (await rota(req, res)) return;
      if (url.pathname.startsWith("/webhooks/") && (await rotaWebhooks(req, res))) return;
      if (url.pathname === "/tarefas/processar") {
        // Agendador externo (ex.: cron da Vercel). Exige Authorization: Bearer <CRON_SECRET>.
        const esperado = Buffer.from(`Bearer ${env.segredoCron}`);
        const veio = Buffer.from(String(req.headers.authorization ?? ""));
        if (!env.segredoCron || esperado.length !== veio.length || !timingSafeEqual(esperado, veio)) { res.writeHead(404).end(); return; }
        const r = await executarCiclo();
        log("info", "automacao.ciclo_agendado", { reqId, ...r });
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(r));
        return;
      }
      if (url.pathname.startsWith("/trpc/")) {
        // Somente desenvolvimento: simula rede lenta para reproduzir condições de corrida da interface
        const retardo = !env.producao ? Number(process.env.RETARDO_MS ?? 0) : 0;
        if (retardo > 0) await new Promise((r) => setTimeout(r, retardo));
        if (!origemValida(req)) { res.writeHead(403).end("Origem não permitida"); return; }
        return trpc(req, res);
      }
      // Arquivos do front-end (build do Vite) com fallback para SPA
      let arquivo = path.join(PASTA_CLIENT, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
      if (!arquivo.startsWith(PASTA_CLIENT) || !existsSync(arquivo) || statSync(arquivo).isDirectory()) arquivo = path.join(PASTA_CLIENT, "index.html");
      if (!existsSync(arquivo)) { res.writeHead(404).end("Front-end não compilado. Rode npm run build em /client."); return; }
      res.writeHead(200, { "content-type": TIPOS[path.extname(arquivo)] ?? "application/octet-stream", "cache-control": arquivo.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable" });
      createReadStream(arquivo).pipe(res);
    } catch (e) {
      log("erro", "http.erro", { reqId, rota: url.pathname, erro: String(e) });
      if (!res.headersSent) res.writeHead(500).end("Erro interno");
    }
  }
}

export function criarServidor() {
  return http.createServer(tratarRequisicao);
}
