import { eq } from "drizzle-orm";
import { db } from "../src/db/index.js";
import { usuario } from "../src/db/schema.js";
import { hashSenha } from "../src/auth/sessao.js";
import { seedBase } from "../src/db/seed.js";
import { appRouter } from "../src/router/index.js";
import type { Contexto } from "../src/router/trpc.js";
import type { Perfil } from "../src/auth/permissoes.js";

export const SENHA = "SenhaTeste123";

export async function prepararBase() {
  await seedBase("admin@teste.dev", SENHA);
}

export async function criarUsuario(perfil: Perfil, email = `${perfil}-${Math.random().toString(36).slice(2)}@teste.dev`) {
  const [u] = await db.insert(usuario).values({ nome: `Teste ${perfil}`, email, perfil, senhaHash: await hashSenha(SENHA) }).returning();
  return u;
}

export function contextoAnonimo(ip = "10.0.0.1") {
  const cookies: string[] = [];
  const ctx: Contexto = { usuario: null, token: undefined, ip, definirCookie: (v) => cookies.push(v) };
  return { ctx, cookies };
}

export async function chamadorComo(perfil: Perfil | "anonimo") {
  if (perfil === "anonimo") return appRouter.createCaller(contextoAnonimo().ctx);
  const u = await criarUsuario(perfil);
  const [p] = await db.select().from(usuario).where(eq(usuario.id, u.id));
  const { senhaHash: _s, ...publico } = p;
  return Object.assign(appRouter.createCaller({ usuario: publico, token: "x", ip: "10.0.0.2", definirCookie: () => {} }), { usuario: publico });
}
