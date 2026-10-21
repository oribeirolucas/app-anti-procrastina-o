import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rodarAgente } from "./agente.js";

// Rotina diária: 11 (painel) → 00 (prioridades + estado) → setores de crescimento em paralelo.
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dados = process.env.DADOS_DO_DIA ?? "Sem integrações conectadas ainda: trabalhe com o estado da empresa.";

const painel = await rodarAgente("11", "Monte o painel do dia e os 3 destaques.", dados);
const briefing = await rodarAgente(
  "00",
  "Faça o briefing diário: placar, gargalo, prioridades por agente e o bloco ESTADO atualizado.",
  painel,
);

// O CEO reescreve a memória compartilhada a partir do bloco ESTADO.
const estado = briefing.match(/#+\s*ESTADO[\s\S]*?(?=\n#+\s*PRÓXIMAS AÇÕES|$)/i)?.[0];
if (estado) fs.writeFileSync(path.join(raiz, "memoria/estado.md"), estado.trim() + "\n");

await Promise.all([
  rodarAgente("03", "Execute as prioridades de hoje para Conteúdo e entregue as peças prontas.", briefing),
  rodarAgente("04", "Execute as prioridades de hoje para Tráfego: decisões e criativos.", briefing),
  rodarAgente("05", "Execute as prioridades de hoje para Prospecção: lista e mensagens.", briefing),
]);
console.error("Rotina concluída.");
