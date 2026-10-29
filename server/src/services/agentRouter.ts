import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { agente } from "../db/schema.js";
import { PROMPTS_PADRAO, type AreaAgente } from "../config/prompts.js";
import type { ContextoCRM } from "./contextService.js";

export type Rota = { area: AreaAgente; motivo: string };

// Etapas do funil por responsabilidade. Nomes das etapas padrão; etapas novas caem pela ordem.
const ETAPAS_SDR = new Set(["lead", "contato feito"]);
const ETAPAS_CLOSER = new Set(["demonstração", "demonstracao", "proposta"]);

/**
 * Decide qual agente atende. Prioridade:
 * 1) cliente com contrato ativo → Customer Success (pós-venda sempre vence o funil);
 * 2) etapa Lead/Contato feito (ou sem oportunidade) → SDR;
 * 3) etapa Demonstração/Proposta → Closer;
 * 4) qualquer outra etapa aberta: ordem ≤ 2 → SDR, senão Closer.
 * Função pura: testável sem banco.
 */
export function rotear(ctx: Pick<ContextoCRM, "contratosAtivos" | "oportunidade">): Rota {
  if (ctx.contratosAtivos.length) return { area: "cs", motivo: "cliente com contrato ativo" };
  const o = ctx.oportunidade;
  if (!o || o.situacao !== "aberta") return { area: "marketing", motivo: o ? `oportunidade ${o.situacao}, recomeça a qualificação` : "lead sem oportunidade" };
  const etapa = o.etapa.trim().toLowerCase();
  if (ETAPAS_SDR.has(etapa)) return { area: "marketing", motivo: `etapa ${o.etapa}` };
  if (ETAPAS_CLOSER.has(etapa)) return { area: "comercial", motivo: `etapa ${o.etapa}` };
  return o.etapaOrdem <= 2 ? { area: "marketing", motivo: `etapa ${o.etapa} (início do funil)` } : { area: "comercial", motivo: `etapa ${o.etapa}` };
}

/** Agente ativo da área. Se não houver nenhum cadastrado na área, cria um com o prompt padrão (inativo). */
export async function agenteDaArea(area: AreaAgente, modeloPadrao: string) {
  const [ativo] = await db.select().from(agente).where(and(eq(agente.area, area), eq(agente.ativo, true))).orderBy(asc(agente.criadoEm)).limit(1);
  if (ativo) return ativo;
  const [qualquer] = await db.select({ id: agente.id }).from(agente).where(eq(agente.area, area)).limit(1);
  if (!qualquer) {
    const p = PROMPTS_PADRAO[area];
    // Nasce inativo: só responde depois que o estrategista revisar o prompt e ativar em Agentes IA
    await db.insert(agente).values({ nome: p.nome, area, systemPrompt: p.prompt, provedor: "anthropic", modelo: modeloPadrao, ativo: false }).onConflictDoNothing();
  }
  return null;
}
