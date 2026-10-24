import { db, type Db } from "../db/index.js";
import { evento } from "../db/schema.js";

export type TipoEvento =
  | "empresa.criada"
  | "contato.criado"
  | "contato.descadastrado"
  | "oportunidade.criada"
  | "oportunidade.etapa_alterada"
  | "oportunidade.encerrada"
  | "interacao.resposta_contato"
  | "contrato.criado"
  | "webhook.recebido";

/** Registra um evento. Retorna false se a chave de idempotência já existia (duplicado). */
export async function emitirEvento(
  tipo: TipoEvento,
  payload: Record<string, unknown>,
  chaveIdempotencia?: string,
  executor: Pick<Db, "insert"> = db,
): Promise<boolean> {
  const r = await executor
    .insert(evento)
    .values({ tipo, payload, chaveIdempotencia })
    .onConflictDoNothing({ target: evento.chaveIdempotencia })
    .returning({ id: evento.id });
  return r.length > 0;
}
