// Log estruturado em JSON (uma linha por evento). Nunca registrar senhas, tokens, e-mails ou conteúdo de mensagens.
type Nivel = "info" | "aviso" | "erro";

export function log(nivel: Nivel, evento: string, dados: Record<string, unknown> = {}) {
  const linha = JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...dados });
  if (nivel === "erro") console.error(linha);
  else if (process.env.NODE_ENV !== "test") console.log(linha);
}
