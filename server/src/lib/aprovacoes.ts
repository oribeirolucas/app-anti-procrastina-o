import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { solicitacaoAprovacao } from "../db/schema.js";

export type TipoAprovacao = "orcamento" | "desconto" | "deploy" | "outro";

/**
 * Usado pelos agentes: coloca uma decisão na fila do estrategista em vez de executá-la.
 * Idempotente pela referência (o agente pode repetir a chamada sem duplicar o pedido).
 * O agente só prossegue quando a solicitação estiver "aprovada".
 */
export async function solicitarAprovacao(dados: { tipo: TipoAprovacao; titulo: string; descricao?: string; valor?: string; agenteId?: string; referencia: string }) {
  await db.insert(solicitacaoAprovacao).values(dados).onConflictDoNothing({ target: solicitacaoAprovacao.referencia });
  const [s] = await db.select().from(solicitacaoAprovacao).where(eq(solicitacaoAprovacao.referencia, dados.referencia));
  return s;
}
