import { TRPCError } from "@trpc/server";
import { beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "../src/router/index.js";
import { validarSessao } from "../src/auth/sessao.js";
import { pode } from "../src/auth/permissoes.js";
import { chamadorComo, contextoAnonimo, prepararBase, SENHA } from "./utils.js";

const codigo = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; }
};

beforeAll(prepararBase);

describe("autenticação", () => {
  it("login correto cria sessão válida e cookie httpOnly", async () => {
    const { ctx, cookies } = contextoAnonimo("10.1.1.1");
    await appRouter.createCaller(ctx).auth.login({ email: "ADMIN@teste.dev", senha: SENHA });
    expect(cookies).toHaveLength(1);
    const u = await validarSessao(cookies[0]);
    expect(u?.email).toBe("admin@teste.dev");
    expect(u).not.toHaveProperty("senhaHash");
  });

  it("senha errada é recusada com mensagem genérica", async () => {
    const { ctx } = contextoAnonimo("10.1.1.2");
    await expect(appRouter.createCaller(ctx).auth.login({ email: "admin@teste.dev", senha: "errada" })).rejects.toThrow("E-mail ou senha incorretos.");
    await expect(appRouter.createCaller(ctx).auth.login({ email: "naoexiste@teste.dev", senha: "errada" })).rejects.toThrow("E-mail ou senha incorretos.");
  });

  it("bloqueia após 5 falhas para o mesmo e-mail, mesmo com a senha certa", async () => {
    const email = "bloqueio@teste.dev";
    const caller = appRouter.createCaller(contextoAnonimo("10.1.1.3").ctx);
    for (let i = 0; i < 5; i++) await codigo(caller.auth.login({ email, senha: "x" }));
    expect(await codigo(caller.auth.login({ email, senha: SENHA }))).toBe("TOO_MANY_REQUESTS");
  });

  it("token inválido não autentica", async () => {
    expect(await validarSessao("token-falso")).toBeNull();
  });
});

describe("controle de acesso no backend", () => {
  it("anônimo não acessa dados", async () => {
    const c = await chamadorComo("anonimo");
    expect(await codigo(c.cadastros.empresas())).toBe("UNAUTHORIZED");
  });

  it("operador não gerencia usuários nem vê financeiro/auditoria", async () => {
    const op = await chamadorComo("operador");
    expect(await codigo(op.admin.usuarios())).toBe("FORBIDDEN");
    expect(await codigo(op.admin.auditoria())).toBe("FORBIDDEN");
    expect(await codigo(op.relatorios.exportar({ entidade: "empresas" }))).toBe("FORBIDDEN");
    expect(await codigo(op.cadastros.empresas())).toBe("OK");
    expect(pode("operador", "financeiro:ler")).toBe(false);
  });

  it("gestor vê auditoria mas não gerencia usuários", async () => {
    const g = await chamadorComo("gestor");
    expect(await codigo(g.admin.auditoria())).toBe("OK");
    expect(await codigo(g.admin.criarUsuario({ nome: "X", email: "x@teste.dev", perfil: "admin", senha: "Senha12345678" }))).toBe("FORBIDDEN");
  });

  it("admin cria usuário (com auditoria), e desativar encerra sessões", async () => {
    const a = await chamadorComo("admin");
    const u = await a.admin.criarUsuario({ nome: "Novo Op", email: "novo.op@teste.dev", perfil: "operador", senha: "Senha12345678" });
    const { ctx, cookies } = contextoAnonimo("10.1.1.9");
    await appRouter.createCaller(ctx).auth.login({ email: "novo.op@teste.dev", senha: "Senha12345678" });
    expect(await validarSessao(cookies[0])).not.toBeNull();
    await a.admin.atualizarUsuario({ id: u.id, ativo: false });
    expect(await validarSessao(cookies[0])).toBeNull();
    const log = await a.admin.auditoria();
    expect(log.some((l) => l.acao === "usuario.criar" && l.entidadeId === u.id)).toBe(true);
  });

  it("senha fraca é rejeitada", async () => {
    const a = await chamadorComo("admin");
    expect(await codigo(a.admin.criarUsuario({ nome: "Fraco", email: "fraco@teste.dev", perfil: "operador", senha: "123" }))).toBe("BAD_REQUEST");
  });
});
