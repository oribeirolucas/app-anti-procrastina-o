import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { configuracao, consumoUso, notificacao, usuario } from "../db/schema.js";
import { hojeNoFuso, intervaloDoPeriodo, obterFuso } from "./datas.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const RECURSOS = {
  ia_conversa: "Conversas com IA",
  ia_tokens: "Tokens de IA",
  whatsapp_conversa: "Conversas no WhatsApp",
  transcricao_segundos: "Áudio transcrito (segundos)",
} as const;
export type Recurso = keyof typeof RECURSOS;

/** Franquia mensal da instalação. `null` = sem limite. */
export type Limites = { [K in Recurso]: number | null } & { bloquearAoAtingir: boolean };
export const LIMITES_PADRAO: Limites = { ia_conversa: null, ia_tokens: null, whatsapp_conversa: null, transcricao_segundos: null, bloquearAoAtingir: false };

export async function obterLimites(exec: Tx | typeof db = db): Promise<Limites> {
  const [c] = await exec.select().from(configuracao).where(eq(configuracao.chave, "limites_uso"));
  return { ...LIMITES_PADRAO, ...((c?.valor as Partial<Limites> | undefined) ?? {}) };
}

/** Mês corrente (AAAA-MM) e seu intervalo UTC no fuso configurado. */
export async function mesAtual(agora = new Date()) {
  const fuso = await obterFuso();
  const hoje = hojeNoFuso(fuso, agora);
  const [a, m] = hoje.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); // último dia do mês
  return { mes: hoje.slice(0, 7), ...intervaloDoPeriodo(`${hoje.slice(0, 7)}-01`, fim, fuso) };
}

export async function usoNoPeriodo(recurso: Recurso, inicio: Date, fimExclusivo: Date, exec: Tx | typeof db = db): Promise<number> {
  const [r] = await exec
    .select({ total: sql<number>`coalesce(sum(${consumoUso.quantidade}), 0)::int` })
    .from(consumoUso)
    .where(and(eq(consumoUso.recurso, recurso), gte(consumoUso.criadoEm, inicio), lt(consumoUso.criadoEm, fimExclusivo)));
  return r.total;
}

/**
 * Consulta antes de gastar: o agente/WhatsApp chama isto e, se `permitido` for falso,
 * não executa a ação paga (encaminha para humano / registra pendência).
 */
export async function verificarLimite(recurso: Recurso, quantidade = 1) {
  const limites = await obterLimites();
  const { inicio, fimExclusivo } = await mesAtual();
  const usado = await usoNoPeriodo(recurso, inicio, fimExclusivo);
  const limite = limites[recurso];
  const excede = limite !== null && usado + quantidade > limite;
  return { permitido: !(excede && limites.bloquearAoAtingir), excede, usado, limite };
}

/**
 * Registra um consumo (idempotente pela referência) e avisa os administradores ao cruzar 80% e 100%
 * da franquia do mês, uma vez por faixa.
 */
export async function registrarConsumo(dados: { recurso: Recurso; quantidade: number; referencia: string; custoEstimado?: string }) {
  return db.transaction(async (tx) => {
    const inserido = await tx
      .insert(consumoUso)
      .values({ recurso: dados.recurso, quantidade: dados.quantidade, referencia: dados.referencia, custoEstimado: dados.custoEstimado })
      .onConflictDoNothing()
      .returning({ id: consumoUso.id });
    const { mes, inicio, fimExclusivo } = await mesAtual();
    const usado = await usoNoPeriodo(dados.recurso, inicio, fimExclusivo, tx);
    const limite = (await obterLimites(tx))[dados.recurso];
    if (inserido.length && limite) {
      const faixas = [100, 80].filter((f) => usado * 100 >= limite * f);
      if (faixas.length) {
        const faixa = faixas[0];
        const admins = await tx.select({ id: usuario.id }).from(usuario).where(and(eq(usuario.perfil, "admin"), eq(usuario.ativo, true)));
        const nome = RECURSOS[dados.recurso];
        await tx
          .insert(notificacao)
          .values(admins.map((a) => ({
            usuarioId: a.id,
            titulo: faixa === 100 ? `Franquia esgotada: ${nome}` : `${nome}: 80% da franquia usada`,
            mensagem: `${usado} de ${limite} neste mês.`,
            link: "/admin/uso",
            chave: `uso:${dados.recurso}:${mes}:${faixa}`,
          })))
          .onConflictDoNothing();
      }
    }
    return { registrado: inserido.length > 0, usado, limite };
  });
}
