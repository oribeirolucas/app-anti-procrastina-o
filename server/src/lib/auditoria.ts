import { db } from "../db/index.js";
import { auditoria } from "../db/schema.js";

export async function auditar(
  usuarioId: string | null,
  acao: string,
  entidade?: string,
  entidadeId?: string,
  detalhes?: Record<string, unknown>,
) {
  await db.insert(auditoria).values({ usuarioId, acao, entidade, entidadeId, detalhes });
}
