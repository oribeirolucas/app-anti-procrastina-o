import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { contrato, empresa, interacao, lancamento, tarefa } from "../../db/schema.js";
import { hojeNoFuso, obterFuso } from "../../lib/datas.js";
import { comPermissao, router } from "../trpc.js";

export type Alerta = { codigo: string; texto: string; peso: number };

/**
 * Health score por regras (0–100), documentado em docs/INDICADORES.md. Cada sinal de risco desconta pontos.
 * Quando o agente de CS existir, ele poderá complementar com análise das conversas; a regra continua como base auditável.
 */
export function calcularSaude(s: { diasSemContato: number | null; cobrancasVencidas: number; tarefasAtrasadas: number; diasParaFim: number | null }) {
  const alertas: Alerta[] = [];
  if (s.cobrancasVencidas > 0) alertas.push({ codigo: "cobranca", texto: `${s.cobrancasVencidas} cobrança(s) vencida(s)`, peso: 30 });
  if (s.diasSemContato === null) alertas.push({ codigo: "sem_contato", texto: "Nenhum contato registrado", peso: 20 });
  else if (s.diasSemContato > 60) alertas.push({ codigo: "sem_contato", texto: `${s.diasSemContato} dias sem contato`, peso: 35 });
  else if (s.diasSemContato > 30) alertas.push({ codigo: "sem_contato", texto: `${s.diasSemContato} dias sem contato`, peso: 20 });
  if (s.tarefasAtrasadas > 0) alertas.push({ codigo: "tarefa", texto: `${s.tarefasAtrasadas} tarefa(s) atrasada(s)`, peso: 15 });
  if (s.diasParaFim !== null && s.diasParaFim <= 30) alertas.push({ codigo: "renovacao", texto: s.diasParaFim < 0 ? "Contrato vencido" : `Contrato vence em ${s.diasParaFim} dia(s)`, peso: 15 });
  const score = Math.max(0, 100 - alertas.reduce((t, a) => t + a.peso, 0));
  return { score, risco: score < 50 ? "alto" : score < 75 ? "medio" : "baixo", alertas } as const;
}

export const sucessoRouter = router({
  clientes: comPermissao("crm:ler").query(async () => {
    const hoje = hojeNoFuso(await obterFuso());
    const ativos = await db
      .select({ empresaId: empresa.id, nome: empresa.nome, mrr: sql<string>`sum(${contrato.valorMensal})::numeric(14,2)::text`, fim: sql<string | null>`min(${contrato.fim})::text`, planos: sql<string>`string_agg(${contrato.plano}, ', ')` })
      .from(contrato)
      .innerJoin(empresa, eq(empresa.id, contrato.empresaId))
      .where(and(eq(contrato.situacao, "ativo"), isNull(empresa.arquivadoEm)))
      .groupBy(empresa.id, empresa.nome);
    if (!ativos.length) return [];
    const ids = ativos.map((a) => a.empresaId);
    const porEmpresa = <T extends { empresaId: string | null }>(l: T[]) => new Map(l.map((x) => [x.empresaId, x]));
    const contatos = porEmpresa(await db.select({ empresaId: interacao.empresaId, ultimo: sql<string>`max(${interacao.criadoEm})::text` }).from(interacao)
      .where(and(inArray(interacao.empresaId, ids), ne(interacao.tipo, "alteracao"))).groupBy(interacao.empresaId));
    const tarefas = porEmpresa(await db.select({ empresaId: tarefa.empresaId, n: sql<number>`count(*)::int` }).from(tarefa)
      .where(and(inArray(tarefa.empresaId, ids), eq(tarefa.concluida, false), lt(tarefa.venceEm, new Date()))).groupBy(tarefa.empresaId));
    const cobrancas = porEmpresa(await db.select({ empresaId: lancamento.empresaId, n: sql<number>`count(*)::int` }).from(lancamento)
      .where(and(inArray(lancamento.empresaId, ids), eq(lancamento.tipo, "receita"), eq(lancamento.situacao, "pendente"), lt(lancamento.vencimento, hoje))).groupBy(lancamento.empresaId));
    const diasEntre = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / 86400_000);
    return ativos
      .map((a) => {
        const ultimo = contatos.get(a.empresaId)?.ultimo ?? null;
        const sinais = {
          diasSemContato: ultimo ? diasEntre(ultimo.slice(0, 10), hoje) : null,
          cobrancasVencidas: cobrancas.get(a.empresaId)?.n ?? 0,
          tarefasAtrasadas: tarefas.get(a.empresaId)?.n ?? 0,
          diasParaFim: a.fim ? diasEntre(hoje, a.fim) : null,
        };
        return { ...a, ultimoContato: ultimo, ...sinais, ...calcularSaude(sinais) };
      })
      .sort((x, y) => x.score - y.score);
  }),
});
