import type { IncomingMessage, ServerResponse } from "node:http";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { configuracao } from "../db/schema.js";
import { planosAtivos } from "../services/contextService.js";
import { json } from "./captacao.js";

/**
 * GET /publico/oferta: planos ativos com promessa, preço e entregas, para o site institucional.
 * Mesma fonte dos agentes. Itens em construção vêm separados ("emBreve") e não devem ser anunciados como incluídos.
 * Público e somente leitura: nenhum dado de cliente sai por aqui.
 */
export async function rotaPublica(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://local");
  if (url.pathname !== "/publico/oferta") return false;
  const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors).end(); return true; }
  if (req.method !== "GET") { res.writeHead(405, { allow: "GET", ...cors }).end(); return true; }
  const [nome] = await db.select().from(configuracao).where(eq(configuracao.chave, "nome_empresa"));
  const planos = (await planosAtivos()).map((p) => ({
    nome: p.nome, valorMensal: p.valorMensal, valorSetup: p.valorSetup, promessa: p.promessa, publicoIdeal: p.publicoIdeal,
    franquiaConversas: p.franquiaConversas,
    inclui: p.entregaveis.filter((e) => e.disponivel).map((e) => e.item),
    emBreve: p.entregaveis.filter((e) => !e.disponivel).map((e) => e.item),
  }));
  json(res, 200, { empresa: typeof nome?.valor === "string" ? nome.valor : null, planos }, { ...cors, "cache-control": "public, max-age=300" });
  return true;
}
