import OpenAI, { toFile } from "openai";

export type ResultadoTranscricao = { texto: string; segundos: number };

/** Falha ao transcrever. `recuperavel` = sobrecarga/rede (vale tentar de novo). */
export class ErroTranscricao extends Error {
  constructor(message: string, readonly recuperavel: boolean) { super(message); }
}

export interface Transcritor {
  transcrever(audio: Buffer, mime: string): Promise<ResultadoTranscricao>;
}

// Áudio de voz do WhatsApp (OGG/Opus) tem ~2 KB por segundo: usado só quando o provedor não informa a duração
export const estimarSegundos = (bytes: number) => Math.max(1, Math.round(bytes / 2000));
const extensao = (mime: string) => ({ "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr", "audio/wav": "wav", "audio/webm": "webm" })[mime.split(";")[0].trim()] ?? "ogg";

/** Transcrição pela OpenAI (ChatGPT). Só transcreve: quem conversa com o cliente é o Claude. */
export class TranscritorOpenAI implements Transcritor {
  constructor(private readonly cliente: OpenAI, private readonly modelo: string) {}

  async transcrever(audio: Buffer, mime: string): Promise<ResultadoTranscricao> {
    try {
      const r = await this.cliente.audio.transcriptions.create({
        file: await toFile(audio, `audio.${extensao(mime)}`, { type: mime.split(";")[0] }),
        model: this.modelo,
        language: "pt",
      });
      const texto = r.text.trim();
      const segundos = r.usage?.type === "duration" ? Math.ceil(r.usage.seconds) : estimarSegundos(audio.length);
      return { texto, segundos };
    } catch (e) {
      if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) throw new ErroTranscricao("chave da OpenAI inválida ou sem permissão", false);
      if (e instanceof OpenAI.BadRequestError) throw new ErroTranscricao(`áudio recusado pela OpenAI: ${e.message}`.slice(0, 280), false);
      if (e instanceof OpenAI.RateLimitError) throw new ErroTranscricao("limite de uso da OpenAI atingido", true);
      if (e instanceof OpenAI.APIError) throw new ErroTranscricao(`OpenAI indisponível (${e.status ?? "rede"})`, true);
      throw new ErroTranscricao(`falha inesperada: ${String(e)}`.slice(0, 280), true);
    }
  }
}

class TranscritorIndisponivel implements Transcritor {
  transcrever(): Promise<ResultadoTranscricao> { return Promise.reject(new ErroTranscricao("OPENAI_API_KEY não configurada", false)); }
}

export function transcritorDoAmbiente(env: NodeJS.ProcessEnv = process.env): Transcritor {
  if (!env.OPENAI_API_KEY) return new TranscritorIndisponivel();
  return new TranscritorOpenAI(new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 2, timeout: 60_000 }), env.OPENAI_MODELO_TRANSCRICAO || "gpt-4o-transcribe");
}
