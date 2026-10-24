import { TRPCError } from "@trpc/server";

// Mensagens para violações de unicidade (código Postgres 23505), pelo nome do índice.
const MENSAGENS: Record<string, string> = {
  empresa_documento_uq: "Já existe uma empresa com este CNPJ.",
  empresa_nome_uq: "Já existe uma empresa com este nome.",
  contato_email_uq: "Já existe um contato com este e-mail.",
  usuario_email_unique: "Já existe um usuário com este e-mail.",
};

function erroPg(e: unknown): { code?: string; constraint?: string } | null {
  let atual: unknown = e;
  for (let i = 0; i < 4 && atual; i++) {
    const x = atual as { code?: string; constraint?: string; cause?: unknown };
    if (typeof x.code === "string" && /^\d{5}$|^[0-9A-Z]{5}$/.test(x.code)) return x;
    atual = x.cause;
  }
  return null;
}

/** Converte erros do banco conhecidos em erros compreensíveis; os demais seguem como erro interno. */
export function traduzirErroBanco(e: unknown): never {
  const pg = erroPg(e);
  if (pg?.code === "23505")
    throw new TRPCError({ code: "CONFLICT", message: MENSAGENS[pg.constraint ?? ""] ?? "Registro duplicado.", cause: e });
  if (pg?.code === "23503")
    throw new TRPCError({ code: "BAD_REQUEST", message: "Registro vinculado inexistente ou em uso.", cause: e });
  throw e;
}

export const conflitoDeVersao = () =>
  new TRPCError({ code: "CONFLICT", message: "Este registro foi alterado por outra pessoa. Recarregue a página e refaça a alteração." });
