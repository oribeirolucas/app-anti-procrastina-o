import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { contato, contrato, empresa, interacao, oportunidade, tarefa, usuario } from "../../db/schema.js";
import { auditar } from "../../lib/auditoria.js";
import { emitirEvento } from "../../lib/eventos.js";
import { comPermissao, router } from "../trpc.js";

const opcional = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const empresaInput = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(200),
  documento: opcional(20).transform((v) => (v ? v.replace(/\D/g, "") || null : null)),
  segmento: opcional(80),
  cidade: opcional(120),
  uf: opcional(2).transform((v) => (v ? v.toUpperCase() : null)),
  telefone: opcional(30),
  site: opcional(200),
  observacoes: opcional(5000),
  responsavelId: z.string().uuid().optional().nullable(),
});

export const contatoInput = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(200),
  empresaId: z.string().uuid().optional().nullable(),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200).optional().nullable().or(z.literal("").transform(() => null)),
  telefone: opcional(30),
  cargo: opcional(100),
});

const busca = z.object({ busca: z.string().trim().max(100).optional(), pagina: z.number().int().min(1).default(1) });
const POR_PAGINA = 50;

export const cadastrosRouter = router({
  empresas: comPermissao("crm:ler")
    .input(busca.extend({ segmento: z.string().optional() }).default({}))
    .query(async ({ input }) => {
      const filtros: SQL[] = [];
      if (input.busca) {
        const termo = `%${input.busca}%`;
        filtros.push(or(ilike(empresa.nome, termo), ilike(empresa.cidade, termo), ilike(empresa.documento, termo))!);
      }
      if (input.segmento) filtros.push(eq(empresa.segmento, input.segmento));
      const where = filtros.length ? and(...filtros) : undefined;
      const [linhas, [{ total }]] = await Promise.all([
        db
          .select({
            id: empresa.id, nome: empresa.nome, segmento: empresa.segmento, cidade: empresa.cidade, uf: empresa.uf,
            telefone: empresa.telefone, responsavel: usuario.nome,
            oportunidadesAbertas: sql<number>`(select count(*)::int from ${oportunidade} o where o.empresa_id = ${empresa.id} and o.situacao = 'aberta')`,
          })
          .from(empresa)
          .leftJoin(usuario, eq(usuario.id, empresa.responsavelId))
          .where(where)
          .orderBy(asc(empresa.nome))
          .limit(POR_PAGINA)
          .offset((input.pagina - 1) * POR_PAGINA),
        db.select({ total: sql<number>`count(*)::int` }).from(empresa).where(where),
      ]);
      return { linhas, total, porPagina: POR_PAGINA };
    }),

  empresa: comPermissao("crm:ler")
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const [e] = await db.select().from(empresa).where(eq(empresa.id, input.id));
      if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada." });
      const [contatos, oportunidades, interacoes, tarefas, contratos] = await Promise.all([
        db.select().from(contato).where(eq(contato.empresaId, e.id)).orderBy(asc(contato.nome)),
        db.select().from(oportunidade).where(eq(oportunidade.empresaId, e.id)).orderBy(desc(oportunidade.criadoEm)),
        db
          .select({ id: interacao.id, tipo: interacao.tipo, descricao: interacao.descricao, criadoEm: interacao.criadoEm, usuario: usuario.nome, oportunidadeId: interacao.oportunidadeId, respostaDoContato: interacao.respostaDoContato })
          .from(interacao)
          .leftJoin(usuario, eq(usuario.id, interacao.usuarioId))
          .where(eq(interacao.empresaId, e.id))
          .orderBy(desc(interacao.criadoEm))
          .limit(200),
        db.select().from(tarefa).where(eq(tarefa.empresaId, e.id)).orderBy(asc(tarefa.concluida), asc(tarefa.venceEm)),
        db.select().from(contrato).where(eq(contrato.empresaId, e.id)).orderBy(desc(contrato.inicio)),
      ]);
      return { ...e, contatos, oportunidades, interacoes, tarefas, contratos };
    }),

  criarEmpresa: comPermissao("crm:escrever")
    .input(empresaInput)
    .mutation(async ({ ctx, input }) => {
      const [e] = await db.insert(empresa).values({ ...input, responsavelId: input.responsavelId ?? ctx.usuario.id }).returning();
      await db.insert(interacao).values({ tipo: "alteracao", descricao: "Empresa cadastrada.", empresaId: e.id, usuarioId: ctx.usuario.id });
      await emitirEvento("empresa.criada", { empresaId: e.id });
      return e;
    }),

  atualizarEmpresa: comPermissao("crm:escrever")
    .input(empresaInput.partial().extend({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...campos } = input;
      const [e] = await db.update(empresa).set({ ...campos, atualizadoEm: new Date() }).where(eq(empresa.id, id)).returning();
      if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada." });
      await db.insert(interacao).values({ tipo: "alteracao", descricao: `Dados alterados: ${Object.keys(campos).join(", ")}.`, empresaId: id, usuarioId: ctx.usuario.id });
      return e;
    }),

  excluirEmpresa: comPermissao("crm:excluir")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(contrato).where(eq(contrato.empresaId, input.id));
      if (c.n > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Empresa possui contratos. Cancele os contratos em vez de excluir." });
      const [e] = await db.delete(empresa).where(eq(empresa.id, input.id)).returning({ nome: empresa.nome });
      await auditar(ctx.usuario.id, "empresa.excluir", "empresa", input.id, { nome: e?.nome });
      return { ok: true };
    }),

  contatos: comPermissao("crm:ler")
    .input(busca.extend({ empresaId: z.string().uuid().optional() }).default({}))
    .query(async ({ input }) => {
      const filtros: SQL[] = [];
      if (input.busca) {
        const termo = `%${input.busca}%`;
        filtros.push(or(ilike(contato.nome, termo), ilike(contato.email, termo), ilike(contato.telefone, termo))!);
      }
      if (input.empresaId) filtros.push(eq(contato.empresaId, input.empresaId));
      const where = filtros.length ? and(...filtros) : undefined;
      const [linhas, [{ total }]] = await Promise.all([
        db
          .select({ id: contato.id, nome: contato.nome, email: contato.email, telefone: contato.telefone, cargo: contato.cargo, descadastrado: contato.descadastrado, empresaId: contato.empresaId, empresa: empresa.nome })
          .from(contato)
          .leftJoin(empresa, eq(empresa.id, contato.empresaId))
          .where(where)
          .orderBy(asc(contato.nome))
          .limit(POR_PAGINA)
          .offset((input.pagina - 1) * POR_PAGINA),
        db.select({ total: sql<number>`count(*)::int` }).from(contato).where(where),
      ]);
      return { linhas, total, porPagina: POR_PAGINA };
    }),

  criarContato: comPermissao("crm:escrever")
    .input(contatoInput)
    .mutation(async ({ ctx, input }) => {
      const [c] = await db.insert(contato).values(input).returning();
      await db.insert(interacao).values({ tipo: "alteracao", descricao: `Contato ${c.nome} cadastrado.`, contatoId: c.id, empresaId: c.empresaId, usuarioId: ctx.usuario.id });
      await emitirEvento("contato.criado", { contatoId: c.id, empresaId: c.empresaId });
      return c;
    }),

  atualizarContato: comPermissao("crm:escrever")
    .input(contatoInput.partial().extend({ id: z.string().uuid(), descadastrado: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...campos } = input;
      const [c] = await db.update(contato).set({ ...campos, atualizadoEm: new Date() }).where(eq(contato.id, id)).returning();
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contato não encontrado." });
      if (input.descadastrado !== undefined) {
        await db.insert(interacao).values({ tipo: "alteracao", descricao: input.descadastrado ? "Contato descadastrado (opt-out)." : "Opt-out removido.", contatoId: id, empresaId: c.empresaId, usuarioId: ctx.usuario.id });
        if (input.descadastrado) await emitirEvento("contato.descadastrado", { contatoId: id });
      }
      return c;
    }),

  excluirContato: comPermissao("crm:excluir")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(contato).where(eq(contato.id, input.id));
      await auditar(ctx.usuario.id, "contato.excluir", "contato", input.id);
      return { ok: true };
    }),
});
