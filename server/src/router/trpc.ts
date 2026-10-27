import type { IncomingMessage, ServerResponse } from "node:http";
import { initTRPC, TRPCError } from "@trpc/server";
import { parseCookie, stringifySetCookie } from "cookie";
import { ZodError } from "zod";
import { COOKIE_SESSAO, validarSessao } from "../auth/sessao.js";
import { pode, type Permissao } from "../auth/permissoes.js";
import { env } from "../lib/env.js";
import { traduzirErroBanco } from "../lib/integridade.js";
import { log } from "../lib/log.js";
import { ipDoCliente } from "../lib/ip.js";
import { executarCiclo } from "../automacoes/motor.js";

export async function criarContexto({ req, res }: { req: IncomingMessage; res: ServerResponse }) {
  const reqId = String(res.getHeader("x-request-id") ?? "");
  const cookies = parseCookie(req.headers.cookie ?? "");
  const token = cookies[COOKIE_SESSAO];
  const usuario = await validarSessao(token);
  const ip = ipDoCliente(req);
  return {
    reqId,
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
  errorFormatter({ shape, error, ctx, path }) {
    const zod = error.cause instanceof ZodError ? error.cause.flatten() : null;
    // Erros internos não vazam detalhes para o cliente
    const message =
      error.code === "INTERNAL_SERVER_ERROR" ? "Erro interno. Tente novamente ou contate o administrador." : shape.message;
    if (error.code === "INTERNAL_SERVER_ERROR")
      log("erro", "trpc.erro_interno", { reqId: ctx?.reqId, path, erro: String(error.cause ?? error), stack: (error.cause as Error | undefined)?.stack?.split("\n").slice(0, 4).join(" | ") });
    return { ...shape, message: zod ? "Dados inválidos. Revise os campos destacados." : message, data: { ...shape.data, zod, stack: undefined } };
  },
});

export const router = t.router;

// Toda chamada passa por aqui: erros conhecidos do banco viram mensagens claras.
const base = t.procedure.use(async ({ next, type, ctx }) => {
  const r = await next();
  if (!r.ok) {
    try { traduzirErroBanco(r.error.cause ?? r.error); } catch (e) { if (e !== (r.error.cause ?? r.error)) throw e; }
  }
  // Após uma alteração bem-sucedida, processa a fila de automações (resultado imediato, inclusive em serverless).
  // Falha aqui nunca derruba a requisição do usuário: fica registrada e o evento é reprocessado depois.
  if (r.ok && type === "mutation" && process.env.AUTOMACOES_INLINE !== "0")
    await executarCiclo({ limite: 20 }).catch((e) => log("erro", "automacao.ciclo_inline", { reqId: ctx.reqId, erro: String(e) }));
  return r;
});
export const publicProcedure = base;

export const autenticado = base.use(({ ctx, next }) => {
  if (!ctx.usuario) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão expirada. Faça login novamente." });
  return next({ ctx: { ...ctx, usuario: ctx.usuario } });
});

export const comPermissao = (permissao: Permissao) =>
  autenticado.use(({ ctx, next }) => {
    if (!pode(ctx.usuario.perfil, permissao))
      throw new TRPCError({ code: "FORBIDDEN", message: "Seu perfil não tem permissão para esta ação." });
    return next();
  });
