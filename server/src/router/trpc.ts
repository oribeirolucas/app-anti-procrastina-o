import type { IncomingMessage, ServerResponse } from "node:http";
import { initTRPC, TRPCError } from "@trpc/server";
import { parseCookie, stringifySetCookie } from "cookie";
import { ZodError } from "zod";
import { COOKIE_SESSAO, validarSessao } from "../auth/sessao.js";
import { pode, type Permissao } from "../auth/permissoes.js";
import { env } from "../lib/env.js";

export async function criarContexto({ req, res }: { req: IncomingMessage; res: ServerResponse }) {
  const cookies = parseCookie(req.headers.cookie ?? "");
  const token = cookies[COOKIE_SESSAO];
  const usuario = await validarSessao(token);
  const ip = (req.socket.remoteAddress ?? "desconhecido").replace("::ffff:", "");
  return {
    usuario,
    token,
    ip,
    definirCookie(valor: string, expira: Date) {
      res.setHeader(
        "Set-Cookie",
        stringifySetCookie({ name: COOKIE_SESSAO, value: valor, httpOnly: true, sameSite: "lax", secure: env.producao, path: "/", expires: expira }),
      );
    },
  };
}
export type Contexto = Awaited<ReturnType<typeof criarContexto>>;

const t = initTRPC.context<Contexto>().create({
  errorFormatter({ shape, error }) {
    const zod = error.cause instanceof ZodError ? error.cause.flatten() : null;
    // Erros internos não vazam detalhes para o cliente
    const message =
      error.code === "INTERNAL_SERVER_ERROR" ? "Erro interno. Tente novamente ou contate o administrador." : shape.message;
    if (error.code === "INTERNAL_SERVER_ERROR") console.error("[erro]", error.cause ?? error);
    return { ...shape, message: zod ? "Dados inválidos. Revise os campos destacados." : message, data: { ...shape.data, zod, stack: undefined } };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const autenticado = t.procedure.use(({ ctx, next }) => {
  if (!ctx.usuario) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão expirada. Faça login novamente." });
  return next({ ctx: { ...ctx, usuario: ctx.usuario } });
});

export const comPermissao = (permissao: Permissao) =>
  autenticado.use(({ ctx, next }) => {
    if (!pode(ctx.usuario.perfil, permissao))
      throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não tem permissão para esta ação." });
    return next();
  });
