// Raiz de composição: monta as dependências reais do atendimento a partir do ambiente.
// Testes não passam por aqui: injetam dublês direto em processarFila/processarConversa.
import { log } from "../lib/log.js";
import { processarFila, type DepsAtendimento } from "./atendimentoService.js";
import { provedoresDoAmbiente } from "./llmService.js";
import { canalDoAmbiente } from "./whatsappService.js";

let deps: DepsAtendimento | null = null;
export function depsDoAmbiente(): DepsAtendimento {
  deps ??= { provedores: provedoresDoAmbiente(), canal: canalDoAmbiente(), modeloPadrao: process.env.MODELO_IA_PADRAO || "claude-opus-5-5" };
  return deps;
}

let rodando: Promise<unknown> | null = null;
/** Dispara o processamento da fila em segundo plano, sem rodar duas vezes em paralelo no mesmo processo. */
export function dispararAtendimento() {
  if (rodando) return rodando;
  rodando = processarFila(depsDoAmbiente())
    .catch((e) => log("erro", "atendimento.fila_erro", { erro: String(e).slice(0, 300) }))
    .finally(() => { rodando = null; });
  return rodando;
}
