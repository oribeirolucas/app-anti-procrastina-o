import { log } from "../lib/log.js";

export type ResultadoEnvio = { enviado: true; idExterno: string | null } | { enviado: false; motivo: string; recuperavel: boolean };

export interface CanalWhatsApp {
  /** Envia texto ao número (só dígitos, com DDI). Não lança: devolve o resultado. */
  enviarTexto(para: string, texto: string): Promise<ResultadoEnvio>;
}

/** WhatsApp Cloud API (Meta). Requer número aprovado e token de sistema. */
export class WhatsAppCloudApi implements CanalWhatsApp {
  constructor(
    private readonly cfg: { token: string; phoneNumberId: string; versaoGraph: string },
    private readonly http: typeof fetch = fetch,
  ) {}

  async enviarTexto(para: string, texto: string): Promise<ResultadoEnvio> {
    const url = `https://graph.facebook.com/${this.cfg.versaoGraph}/${this.cfg.phoneNumberId}/messages`;
    try {
      const r = await this.http(url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "text", text: { preview_url: false, body: texto.slice(0, 4096) } }),
        signal: AbortSignal.timeout(15_000),
      });
      const corpo = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
      if (r.ok) return { enviado: true, idExterno: corpo.messages?.[0]?.id ?? null };
      // 429/5xx: tentar de novo depois; 4xx: problema de configuração ou do número (não adianta repetir)
      const recuperavel = r.status === 429 || r.status >= 500;
      return { enviado: false, motivo: `Meta ${r.status}: ${corpo.error?.message ?? "erro"}`.slice(0, 280), recuperavel };
    } catch (e) {
      return { enviado: false, motivo: `rede: ${String(e)}`.slice(0, 280), recuperavel: true };
    }
  }
}

/** Canal desligado: nada sai do sistema. Usado em testes e enquanto o WhatsApp não estiver configurado. */
export class WhatsAppDesligado implements CanalWhatsApp {
  readonly enviados: { para: string; texto: string }[] = [];
  constructor(private readonly motivo = "WhatsApp não configurado") {}
  async enviarTexto(para: string, texto: string): Promise<ResultadoEnvio> {
    this.enviados.push({ para, texto });
    log("aviso", "whatsapp.envio_desligado", { motivo: this.motivo });
    return { enviado: false, motivo: this.motivo, recuperavel: false };
  }
}

export function canalDoAmbiente(env: NodeJS.ProcessEnv = process.env): CanalWhatsApp {
  // Nunca envia de verdade em teste, mesmo com credenciais no ambiente
  if (env.NODE_ENV === "test") return new WhatsAppDesligado("ambiente de teste");
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return new WhatsAppDesligado();
  return new WhatsAppCloudApi({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, versaoGraph: env.WHATSAPP_GRAPH_VERSAO || "v21.0" });
}
