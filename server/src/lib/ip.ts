import type { IncomingMessage } from "node:http";
import { env } from "./env.js";

/** IP do cliente. Só usa X-Forwarded-For com TRUST_PROXY=1 (senão qualquer um forjaria o cabeçalho). */
export function ipDoCliente(req: IncomingMessage): string {
  if (env.confiarProxy) {
    const xff = req.headers["x-forwarded-for"];
    const primeiro = (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim();
    if (primeiro) return primeiro;
  }
  return (req.socket.remoteAddress ?? "desconhecido").replace("::ffff:", "");
}
