import { log } from "../lib/log.js";

export type ResultadoEnvio = { enviado: true; idExterno: string | null } | { enviado: false; motivo: string; recuperavel: boolean };

export type Midia = { dados: Buffer; mime: string };
export const LIMITE_MIDIA = 16 * 1024 * 1024; // limite de áudio da Meta; a OpenAI aceita até 25 MB

export interface CanalWhatsApp {
  /** Envia texto ao número (só dígitos, com DDI). Não lança: devolve o resultado. */
  enviarTexto(para: string, texto: string): Promise<ResultadoEnvio>;
  /** Envia um modelo aprovado pela Meta (obrigatório para escrever primeiro fora da janela de 24h). */
  enviarModelo(para: string, modelo: string, idioma: string, parametros: string[]): Promise<ResultadoEnvio>;
  /** Baixa uma mídia recebida (ex.: áudio) pelo id da Meta. Lança se não conseguir. */
  baixarMidia(midiaId: string): Promise<Midia>;
}

/** WhatsApp Cloud API (Meta). Requer número aprovado e token de sistema. */
export class WhatsAppCloudApi implements CanalWhatsApp {
  constructor(
    private readonly cfg: { token: string; phoneNumberId: string; versaoGraph: string },
    private readonly http: typeof fetch = fetch,
  ) {}

  enviarTexto(para: string, texto: string): Promise<ResultadoEnvio> {
    return this.enviar({ messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "text", text: { preview_url: false, body: texto.slice(0, 4096) } });
  }

  enviarModelo(para: string, modelo: string, idioma: string, parametros: string[]): Promise<ResultadoEnvio> {
    return this.enviar({
      messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "template",
      template: { name: modelo, language: { code: idioma }, components: parametros.length ? [{ type: "body", parameters: parametros.map((t) => ({ type: "text", text: t.slice(0, 1000) })) }] : [] },
    });
  }

  private async enviar(corpoEnvio: unknown): Promise<ResultadoEnvio> {
    const url = `https://graph.facebook.com/${this.cfg.versaoGraph}/${this.cfg.phoneNumberId}/messages`;
    try {
      const r = await this.http(url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.cfg.token}`, "content-type": "application/json" },
        body: JSON.stringify(corpoEnvio),
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

  async baixarMidia(midiaId: string): Promise<Midia> {
    const auth = { authorization: `Bearer ${this.cfg.token}` };
    // 1) a Meta devolve uma URL temporária; 2) o arquivo é baixado dela com o mesmo token
    const info = await this.http(`https://graph.facebook.com/${this.cfg.versaoGraph}/${encodeURIComponent(midiaId)}`, { headers: auth, signal: AbortSignal.timeout(15_000) });
    if (!info.ok) throw new Error(`Meta ${info.status} ao consultar mídia`);
    const { url, mime_type, file_size } = (await info.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!url) throw new Error("mídia sem URL");
    if (file_size && file_size > LIMITE_MIDIA) throw new Error("mídia maior que o limite");
    const arq = await this.http(url, { headers: auth, signal: AbortSignal.timeout(30_000) });
    if (!arq.ok) throw new Error(`Meta ${arq.status} ao baixar mídia`);
    const dados = Buffer.from(await arq.arrayBuffer());
    if (dados.length > LIMITE_MIDIA) throw new Error("mídia maior que o limite");
    return { dados, mime: mime_type ?? arq.headers.get("content-type") ?? "audio/ogg" };
  }
}

/** Canal desligado: nada sai do sistema. Usado em testes e enquanto o WhatsApp não estiver configurado. */
export class WhatsAppDesligado implements CanalWhatsApp {
  readonly enviados: { para: string; texto: string }[] = [];
  readonly modelos: { para: string; modelo: string; parametros: string[] }[] = [];
  constructor(private readonly motivo = "WhatsApp não configurado") {}
  async enviarTexto(para: string, texto: string): Promise<ResultadoEnvio> {
    this.enviados.push({ para, texto });
    log("aviso", "whatsapp.envio_desligado", { motivo: this.motivo });
    return { enviado: false, motivo: this.motivo, recuperavel: false };
  }
  async enviarModelo(para: string, modelo: string, _idioma: string, parametros: string[]): Promise<ResultadoEnvio> {
    this.modelos.push({ para, modelo, parametros });
    return { enviado: false, motivo: this.motivo, recuperavel: false };
  }
  readonly midias = new Map<string, Midia>();
  async baixarMidia(midiaId: string): Promise<Midia> {
    const m = this.midias.get(midiaId); // dublê de teste pode registrar mídias aqui
    if (!m) throw new Error(this.motivo);
    return m;
  }
}

export function canalDoAmbiente(env: NodeJS.ProcessEnv = process.env): CanalWhatsApp {
  // Nunca envia de verdade em teste, mesmo com credenciais no ambiente
  if (env.NODE_ENV === "test") return new WhatsAppDesligado("ambiente de teste");
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return new WhatsAppDesligado();
  return new WhatsAppCloudApi({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, versaoGraph: env.WHATSAPP_GRAPH_VERSAO || "v21.0" });
}
