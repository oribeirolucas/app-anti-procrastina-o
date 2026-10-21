import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirAgentes = path.resolve(raiz, "../agentes");
const arquivoEstado = path.join(raiz, "memoria/estado.md");

const MODEL = process.env.MODELO ?? "claude-opus-5-5";
// Agentes que pesquisam fora (mercado, conteúdo, tráfego, prospecção) ganham busca na web.
const COM_BUSCA = new Set(["01", "03", "04", "05"]);

const client = new Anthropic();

export function promptDoAgente(id: string): { nome: string; texto: string } {
  const arquivo = fs.readdirSync(dirAgentes).find((f) => f.startsWith(`${id}-`));
  if (!arquivo) throw new Error(`Agente ${id} não encontrado em ${dirAgentes}`);
  const base = fs.readFileSync(path.join(dirAgentes, "_base.md"), "utf8");
  const especifico = fs.readFileSync(path.join(dirAgentes, arquivo), "utf8");
  return { nome: arquivo.replace(/\.md$/, ""), texto: `${base}\n\n${especifico}` };
}

export async function rodarAgente(id: string, tarefa: string, contexto = ""): Promise<string> {
  const { nome, texto } = promptDoAgente(id);
  const estado = fs.existsSync(arquivoEstado) ? fs.readFileSync(arquivoEstado, "utf8") : "";
  const hoje = new Date().toISOString().slice(0, 10);

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    // Prompt do agente é estável: fica em cache entre execuções.
    system: [{ type: "text", text: texto, cache_control: { type: "ephemeral" } }],
    tools: COM_BUSCA.has(id) ? [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }] : undefined,
    messages: [
      {
        role: "user",
        content: `Data: ${hoje}\n\n<estado_empresa>\n${estado}\n</estado_empresa>\n\n${
          contexto ? `<contexto>\n${contexto}\n</contexto>\n\n` : ""
        }Tarefa: ${tarefa}`,
      },
    ],
  } as Anthropic.Beta.Messages.MessageCreateParamsStreaming);

  const resposta = await stream.finalMessage();
  if (resposta.stop_reason === "refusal") {
    throw new Error(`Agente ${nome} recusou a tarefa: ${JSON.stringify(resposta.stop_details)}`);
  }
  const saida = resposta.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("\n")
    .trim();

  const dirSaida = path.join(raiz, "saidas", hoje);
  fs.mkdirSync(dirSaida, { recursive: true });
  const arquivo = path.join(dirSaida, `${nome}-${Date.now()}.md`);
  fs.writeFileSync(arquivo, `# ${nome}\n\n**Tarefa:** ${tarefa}\n\n${saida}\n`);
  console.error(`✔ ${nome} → ${path.relative(raiz, arquivo)}`);
  return saida;
}

// CLI: npm run agente -- <id> "<tarefa>"  (contexto opcional via stdin)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [id, ...resto] = process.argv.slice(2);
  if (!id || resto.length === 0) {
    console.error('Uso: npm run agente -- <id 00-11> "<tarefa>"');
    process.exit(1);
  }
  const contexto = process.stdin.isTTY ? "" : fs.readFileSync(0, "utf8");
  console.log(await rodarAgente(id, resto.join(" "), contexto));
}
