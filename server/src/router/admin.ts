import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { auditoria, configuracao, usuario } from "../db/schema.js";
import { encerrarSessoesDoUsuario, hashSenha } from "../auth/sessao.js";
import { PERMISSOES } from "../auth/permissoes.js";
import { auditar } from "../lib/auditoria.js";
import { autenticado, comPermissao, router } from "./trpc.js";

const senhaForte = z
  .string()
  .min(10, "A senha precisa de pelo menos 10 caracteres.")
  .max(200)
  .regex(/[A-Za-z]/, "Inclua letras.")
  .regex(/\d/, "Inclua números.");

const perfil = z.enum(["admin", "gestor", "operador"]);
const colunasPublicas = {
  id: usuario.id,
  nome: usuario.nome,
  email: usuario.email,
  perfil: usuario.perfil,
  ativo: usuario.ativo,
  criadoEm: usuario.criadoEm,
};

async function garantirOutroAdminAtivo(excetoId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(usuario)
    .where(and(eq(usuario.perfil, "admin"), eq(usuario.ativo, true), ne(usuario.id, excetoId)));
  if (r.n === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "É preciso manter pelo menos um administrador ativo." });
}

export const adminRouter = router({
  // Lista simples para selects de responsável (qualquer usuário logado)
  responsaveis: autenticado.query(() =>
    db.select({ id: usuario.id, nome: usuario.nome }).from(usuario).where(eq(usuario.ativo, true)).orderBy(asc(usuario.nome)),
  ),

  usuarios: comPermissao("usuarios:gerir").query(() => db.select(colunasPublicas).from(usuario).orderBy(asc(usuario.nome))),

  criarUsuario: comPermissao("usuarios:gerir")
    .input(z.object({ nome: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email(), perfil, senha: senhaForte }))
    .mutation(async ({ ctx, input }) => {
      const existe = await db.select({ id: usuario.id }).from(usuario).where(eq(usuario.email, input.email));
      if (existe.length) throw new TRPCError({ code: "CONFLICT", message: "Já existe um usuário com este e-mail." });
      const [u] = await db
        .insert(usuario)
        .values({ nome: input.nome, email: input.email, perfil: input.perfil, senhaHash: await hashSenha(input.senha) })
        .returning(colunasPublicas);
      await auditar(ctx.usuario.id, "usuario.criar", "usuario", u.id, { email: u.email, perfil: u.perfil });
      return u;
    }),

  atualizarUsuario: comPermissao("usuarios:gerir")
    .input(z.object({ id: z.string().uuid(), nome: z.string().trim().min(2).max(120).optional(), perfil: perfil.optional(), ativo: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [atual] = await db.select().from(usuario).where(eq(usuario.id, input.id));
      if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
      const perdeAdmin = atual.perfil === "admin" && ((input.perfil && input.perfil !== "admin") || input.ativo === false);
      if (perdeAdmin) await garantirOutroAdminAtivo(atual.id);
      const { id, ...campos } = input;
      const [u] = await db.update(usuario).set({ ...campos, atualizadoEm: new Date() }).where(eq(usuario.id, id)).returning(colunasPublicas);
      if (input.ativo === false || (input.perfil && input.perfil !== atual.perfil)) await encerrarSessoesDoUsuario(id);
      await auditar(ctx.usuario.id, "usuario.atualizar", "usuario", id, campos);
      return u;
    }),

  redefinirSenha: comPermissao("usuarios:gerir")
    .input(z.object({ id: z.string().uuid(), senha: senhaForte }))
    .mutation(async ({ ctx, input }) => {
      await db.update(usuario).set({ senhaHash: await hashSenha(input.senha), atualizadoEm: new Date() }).where(eq(usuario.id, input.id));
      await encerrarSessoesDoUsuario(input.id);
      await auditar(ctx.usuario.id, "usuario.redefinir_senha", "usuario", input.id);
      return { ok: true };
    }),

  matrizPermissoes: comPermissao("usuarios:gerir").query(() => PERMISSOES),

  auditoria: comPermissao("auditoria:ver")
    .input(z.object({ limite: z.number().int().min(1).max(500).default(100) }).default({}))
    .query(({ input }) =>
      db
        .select({ id: auditoria.id, acao: auditoria.acao, entidade: auditoria.entidade, entidadeId: auditoria.entidadeId, detalhes: auditoria.detalhes, criadoEm: auditoria.criadoEm, usuario: usuario.nome })
        .from(auditoria)
        .leftJoin(usuario, eq(usuario.id, auditoria.usuarioId))
        .orderBy(desc(auditoria.criadoEm))
        .limit(input.limite),
    ),

  configuracoes: comPermissao("config:gerir").query(() => db.select().from(configuracao)),

  salvarConfiguracao: comPermissao("config:gerir")
    .input(z.object({ chave: z.enum(["fuso_horario", "nome_empresa"]), valor: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      if (input.chave === "fuso_horario") {
        try { new Intl.DateTimeFormat("pt-BR", { timeZone: input.valor }); }
        catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Fuso horário inválido (use o formato America/Sao_Paulo)." }); }
      }
      await db
        .insert(configuracao)
        .values({ chave: input.chave, valor: input.valor })
        .onConflictDoUpdate({ target: configuracao.chave, set: { valor: input.valor, atualizadoEm: new Date() } });
      await auditar(ctx.usuario.id, "config.salvar", "configuracao", input.chave, { valor: input.valor });
      return { ok: true };
    }),
});
