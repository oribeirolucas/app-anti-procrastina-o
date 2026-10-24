import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { usuario } from "../db/schema.js";
import { permissoesDoPerfil } from "../auth/permissoes.js";
import {
  bloqueadoPorTentativas,
  conferirSenha,
  criarSessao,
  encerrarSessao,
  hashSenha,
  registrarTentativa,
} from "../auth/sessao.js";
import { obterFuso } from "../lib/datas.js";
import { auditar } from "../lib/auditoria.js";
import { publicProcedure, router } from "./trpc.js";

// Hash de referência para quando o e-mail não existe (mantém o tempo de resposta parecido).
const hashFalso = hashSenha("senha-inexistente-referencia");

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email(), senha: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      if (await bloqueadoPorTentativas(input.email, ctx.ip))
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Muitas tentativas. Aguarde 15 minutos." });

      const [u] = await db.select().from(usuario).where(eq(usuario.email, input.email)).limit(1);
      const ok = await conferirSenha(u?.senhaHash ?? (await hashFalso), input.senha);
      if (!u || !ok || !u.ativo) {
        await registrarTentativa(input.email, ctx.ip, false);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mail ou senha incorretos." });
      }
      await registrarTentativa(input.email, ctx.ip, true);
      const { token, expiraEm } = await criarSessao(u.id);
      ctx.definirCookie(token, expiraEm);
      await auditar(u.id, "login");
      return { ok: true };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    await encerrarSessao(ctx.token);
    ctx.definirCookie("", new Date(0));
    if (ctx.usuario) await auditar(ctx.usuario.id, "logout");
    return { ok: true };
  }),

  eu: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.usuario) return null;
    return { ...ctx.usuario, permissoes: permissoesDoPerfil(ctx.usuario.perfil), fuso: await obterFuso() };
  }),
});
