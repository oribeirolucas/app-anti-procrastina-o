import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, gte, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { sessao, tentativaLogin, usuario } from "../db/schema.js";
import { env } from "../lib/env.js";

export const COOKIE_SESSAO = "sid";

export const hashSenha = (senha: string) => hash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const conferirSenha = (h: string, senha: string) => verify(h, senha).catch(() => false);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function criarSessao(usuarioId: string): Promise<{ token: string; expiraEm: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + env.sessaoHoras * 3600_000);
  await db.insert(sessao).values({ id: sha256(token), usuarioId, expiraEm });
  return { token, expiraEm };
}

export async function validarSessao(token: string | undefined) {
  if (!token) return null;
  const [linha] = await db
    .select({ sessaoId: sessao.id, u: usuario })
    .from(sessao)
    .innerJoin(usuario, eq(usuario.id, sessao.usuarioId))
    .where(and(eq(sessao.id, sha256(token)), gt(sessao.expiraEm, new Date())))
    .limit(1);
  if (!linha || !linha.u.ativo) return null;
  const { senhaHash: _omit, ...u } = linha.u;
  return u;
}

export async function encerrarSessao(token: string | undefined) {
  if (token) await db.delete(sessao).where(eq(sessao.id, sha256(token)));
}

export async function encerrarSessoesDoUsuario(usuarioId: string) {
  await db.delete(sessao).where(eq(sessao.usuarioId, usuarioId));
}

export async function limparSessoesExpiradas() {
  await db.delete(sessao).where(lt(sessao.expiraEm, new Date()));
}

// Limite: 5 falhas por e-mail ou 20 por IP em 15 minutos.
const JANELA_MIN = 15;
export async function bloqueadoPorTentativas(email: string, ip: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_MIN * 60_000);
  const contar = async (chave: string) => {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(tentativaLogin)
      .where(and(eq(tentativaLogin.chave, chave), eq(tentativaLogin.sucesso, false), gte(tentativaLogin.criadoEm, desde)));
    return r.n;
  };
  return (await contar(`email:${email}`)) >= 5 || (await contar(`ip:${ip}`)) >= 20;
}

export async function registrarTentativa(email: string, ip: string, sucesso: boolean) {
  await db.insert(tentativaLogin).values([
    { chave: `email:${email}`, sucesso },
    { chave: `ip:${ip}`, sucesso },
  ]);
}
