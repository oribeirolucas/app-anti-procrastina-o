import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// Contrato de saída de todos os agentes: texto para o cliente + ações que o SISTEMA valida e executa.
export const TIPOS_ACAO = ["qualificado", "oferecer_desconto", "solicitar_aprovacao", "pedir_link_pagamento", "risco_cancelamento", "transferir_humano", "descadastrar"] as const;
export const saidaAgenteSchema = z.object({
  resposta: z.string(),
  acoes: z.array(
    z.object({
      tipo: z.enum(TIPOS_ACAO),
      descricao: z.string().nullable(),
      percentual: z.number().nullable(),
      valor: z.string().nullable(),
    }),
  ),
});
export type SaidaAgente = z.infer<typeof saidaAgenteSchema>;
export type AcaoAgente = SaidaAgente["acoes"][number];

export type Turno = { papel: "cliente" | "agente"; texto: string };
export type PedidoLLM = { provedor: string; modelo: string; system: string; contexto: string; historico: Turno[] };
export type RespostaLLM = { saida: SaidaAgente; tokensEntrada: number; tokensSaida: number; modeloUsado: string };

/** Falha do provedor. `recuperavel` = vale tentar de novo depois (sobrecarga, limite, rede). */
export class ErroLLM extends Error {
  constructor(message: string, readonly recuperavel: boolean) { super(message); }
}

export interface ProvedorLLM {
  gerar(pedido: PedidoLLM): Promise<RespostaLLM>;
}

// Modelos com fallback no servidor quando a resposta é recusada por política (ver docs da Anthropic).
const COM_FALLBACK = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export class ProvedorAnthropic implements ProvedorLLM {
  constructor(private readonly cliente: Anthropic) {}

  async gerar(p: PedidoLLM): Promise<RespostaLLM> {
    // Histórico em turnos alternados; mensagens seguidas do mesmo lado são unidas pela API.
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      // O contexto do CRM entra como dado, antes da conversa, e não como instrução
      { role: "user", content: `<contexto>\n${p.contexto}\n</contexto>` },
      ...p.historico.map((t): Anthropic.Beta.BetaMessageParam => ({ role: t.papel === "cliente" ? "user" : "assistant", content: t.texto })),
    ];
    // A última mensagem precisa ser do cliente (não há prefill nos modelos atuais)
    if (messages[messages.length - 1].role !== "user") messages.push({ role: "user", content: "(sem nova mensagem do cliente)" });
    const fallback = COM_FALLBACK.has(p.modelo);
    try {
      const r = await this.cliente.beta.messages.parse({
        model: p.modelo,
        max_tokens: 4000,
        system: [{ type: "text", text: p.system, cache_control: { type: "ephemeral" } }],
        messages,
        output_config: { effort: "low", format: betaZodOutputFormat(saidaAgenteSchema) },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      if (r.stop_reason === "refusal") throw new ErroLLM("resposta recusada pelo modelo", false);
      if (r.stop_reason === "max_tokens") throw new ErroLLM("resposta cortada (max_tokens)", true);
      if (!r.parsed_output) throw new ErroLLM("resposta fora do formato", true);
      return { saida: r.parsed_output, tokensEntrada: r.usage.input_tokens, tokensSaida: r.usage.output_tokens, modeloUsado: r.model };
    } catch (e) {
      if (e instanceof ErroLLM) throw e;
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new ErroLLM("chave da Anthropic inválida ou sem permissão", false);
      if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.NotFoundError) throw new ErroLLM(`requisição recusada pela API: ${e.message}`.slice(0, 280), false);
      if (e instanceof Anthropic.RateLimitError) throw new ErroLLM("limite de uso da API atingido", true);
      if (e instanceof Anthropic.APIError) throw new ErroLLM(`API indisponível (${e.status ?? "rede"})`, true);
      throw new ErroLLM(`falha inesperada: ${String(e)}`.slice(0, 280), true);
    }
  }
}

/** Provedor sem integração: falha de forma explícita (o atendimento cai no fallback e vai para um humano). */
class ProvedorIndisponivel implements ProvedorLLM {
  constructor(private readonly motivo: string) {}
  gerar(): Promise<RespostaLLM> { return Promise.reject(new ErroLLM(this.motivo, false)); }
}

export type RegistroProvedores = Record<string, ProvedorLLM>;

/** Provedores a partir das variáveis de ambiente. OpenAI e Gemini ficam explícitos como não integrados. */
export function provedoresDoAmbiente(env: NodeJS.ProcessEnv = process.env): RegistroProvedores {
  return {
    anthropic: env.ANTHROPIC_API_KEY
      ? new ProvedorAnthropic(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 }))
      : new ProvedorIndisponivel("ANTHROPIC_API_KEY não configurada"),
    openai: new ProvedorIndisponivel("integração com OpenAI ainda não implementada"),
    google: new ProvedorIndisponivel("integração com Gemini ainda não implementada"),
  };
}
