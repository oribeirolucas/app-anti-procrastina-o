import { db, type Db } from "../db/index.js";
import { auditoria } from "../db/schema.js";

export async function auditar(
  usuarioId: string | null,
  acao: string,
  entidade?: string,
  entidadeId?: string,
  detalhes?: Record<string, unknown>,
  executor: Pick<Db, "insert"> = db,
) {
  await executor.insert(auditoria).values({ usuarioId, acao, entidade, entidadeId, detalhes });
}
