import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ilike, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { contato, contrato, empresa, interacao, oportunidade, tarefa, usuario } from "../../db/schema.js";
import { auditar } from "../../lib/auditoria.js";
import { emitirEvento } from "../../lib/eventos.js";
import { conflitoDeVersao } from "../../lib/integridade.js";
import { comPermissao, router } from "../trpc.js";

const opcional = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const empresaInput = z.object({
  nome: z.string().trim().min(2, "Informe o nome (mín. 2 letras).").max(200),
  documento: opcional(20)
    .transform((v) => (v ? v.replace(/\D/g, "") || null : null))
    .refine((v) => v === null || v.length === 14, "CNPJ deve ter 14 dígitos."),
  segmento: opcional(80),
  cidade: opcional(120),
  uf: opcional(2).transform((v) => (v ? v.toUpperCase() : null)),
  telefone: opcional(30),
  site: opcional(200),
  observacoes: opcional(5000),
  responsavelId: z.string().uuid().optional().nullable(),
});

export const contatoInput = z.object({
  nome: z.string().trim().min(2, "Informe o nome (mín. 2 letras).").max(200),
  empresaId: z.string().uuid().optional().nullable(),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(200).optional().nullable().or(z.literal("").transform(() => null)),
  telefone: opcional(30),
  cargo: opcional(100),
});

const busca = z.object({
  busca: z.string().trim().max(100).optional(),
  pagina: z.number().int().min(1).default(1),
  arquivados: z.boolean().default(false),
});
const POR_PAGINA = 50;
const versaoInput = z.number().int().min(1);

export const cadastrosRouter = router({
  empresas: comPermissao("crm:ler")
    .input(busca.extend({ segmento: z.string().optional() }).prefault({}))
    .query(async ({ input }) => {
      const filtros: SQL[] = [input.arquivados ? isNotNull(empresa.arquivadoEm) : isNull(empresa.arquivadoEm)];
      if (input.busca) {
        const termo = `%${input.busca}%`;
        filtros.push(or(ilike(empresa.nome, termo), ilike(empresa.cidade, termo), ilike(empresa.documento, termo))!);
      }
      if (input.segmento) filtros.push(eq(empresa.segmento, input.segmento));
      const where = and(...filtros);
      const [linhas, [{ total }]] = await Promise.all([
        db
          .select({
            id: empresa.id, nome: empresa.nome, segmento: empresa.segmento, cidade: empresa.cidade, uf: empresa.uf,
            telefone: empresa.telefone, responsavel: usuario.nome, arquivadoEm: empresa.arquivadoEm,
            oportunidadesAbertas: sql<number>`(select count(*)::int from ${oportunidade} o where o.empresa_id = ${empresa.id} and o.situacao = 'aberta' and o.arquivado_em is null)`,
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
        db.select().from(contato).where(and(eq(contato.empresaId, e.id), isNull(contato.arquivadoEm))).orderBy(asc(contato.nome)).limit(200),
        db.select().from(oportunidade).where(and(eq(oportunidade.empresaId, e.id), isNull(oportunidade.arquivadoEm))).orderBy(desc(oportunidade.criadoEm)).limit(200),
        db
          .select({ id: interacao.id, tipo: interacao.tipo, descricao: interacao.descricao, criadoEm: interacao.criadoEm, usuario: usuario.nome, oportunidadeId: interacao.oportunidadeId, respostaDoContato: interacao.respostaDoContato })
          .from(interacao)
          .leftJoin(usuario, eq(usuario.id, interacao.usuarioId))
          .where(eq(interacao.empresaId, e.id))
          .orderBy(desc(interacao.criadoEm))
          .limit(200),
        db.select().from(tarefa).where(eq(tarefa.empresaId, e.id)).orderBy(asc(tarefa.concluida), asc(tarefa.venceEm)).limit(200),
        db.select().from(contrato).where(eq(contrato.empresaId, e.id)).orderBy(desc(contrato.inicio)).limit(100),
      ]);
      return { ...e, contatos, oportunidades, interacoes, tarefas, contratos };
    }),

  criarEmpresa: comPermissao("crm:escrever")
    .input(empresaInput)
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const [e] = await tx.insert(empresa).values({ ...input, responsavelId: input.responsavelId ?? ctx.usuario.id }).returning();
        await tx.insert(interacao).values({ tipo: "alteracao", descricao: "Empresa cadastrada.", empresaId: e.id, usuarioId: ctx.usuario.id });
        await emitirEvento("empresa.criada", { empresaId: e.id }, undefined, tx);
        return e;
      }),
    ),

  atualizarEmpresa: comPermissao("crm:escrever")
    .input(empresaInput.partial().extend({ id: z.string().uuid(), versao: versaoInput }))
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const { id, versao, ...campos } = input;
        const [e] = await tx
          .update(empresa)
          .set({ ...campos, versao: sql`${empresa.versao} + 1`, atualizadoEm: new Date() })
          .where(and(eq(empresa.id, id), eq(empresa.versao, versao)))
          .returning();
        if (!e) throw conflitoDeVersao();
        await tx.insert(interacao).values({ tipo: "alteracao", descricao: `Dados alterados: ${Object.keys(campos).join(", ")}.`, empresaId: id, usuarioId: ctx.usuario.id });
        return e;
      }),
    ),

  // Arquivar esconde a empresa (e suas oportunidades abertas) sem apagar histórico nem indicadores passados.
  arquivarEmpresa: comPermissao("crm:arquivar")
    .input(z.object({ id: z.string().uuid(), arquivar: z.boolean() }))
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        if (input.arquivar) {
          const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(contrato).where(and(eq(contrato.empresaId, input.id), eq(contrato.situacao, "ativo")));
          if (c.n > 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Empresa possui contrato ativo. Cancele o contrato antes de arquivar." });
        }
        const [e] = await tx.update(empresa).set({ arquivadoEm: input.arquivar ? new Date() : null, versao: sql`${empresa.versao} + 1` }).where(eq(empresa.id, input.id)).returning();
        if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada." });
        await tx.insert(interacao).values({ tipo: "alteracao", descricao: input.arquivar ? "Empresa arquivada." : "Empresa reativada.", empresaId: e.id, usuarioId: ctx.usuario.id });
        await auditar(ctx.usuario.id, input.arquivar ? "empresa.arquivar" : "empresa.desarquivar", "empresa", e.id, undefined, tx);
        return e;
      }),
    ),

  contatos: comPermissao("crm:ler")
    .input(busca.extend({ empresaId: z.string().uuid().optional() }).prefault({}))
    .query(async ({ input }) => {
      const filtros: SQL[] = [input.arquivados ? isNotNull(contato.arquivadoEm) : isNull(contato.arquivadoEm)];
      if (input.busca) {
        const termo = `%${input.busca}%`;
        filtros.push(or(ilike(contato.nome, termo), ilike(contato.email, termo), ilike(contato.telefone, termo))!);
      }
      if (input.empresaId) filtros.push(eq(contato.empresaId, input.empresaId));
      const where = and(...filtros);
      const [linhas, [{ total }]] = await Promise.all([
        db
          .select({ id: contato.id, nome: contato.nome, email: contato.email, telefone: contato.telefone, cargo: contato.cargo, descadastrado: contato.descadastrado, empresaId: contato.empresaId, empresa: empresa.nome, versao: contato.versao, anonimizadoEm: contato.anonimizadoEm })
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
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const [c] = await tx.insert(contato).values(input).returning();
        await tx.insert(interacao).values({ tipo: "alteracao", descricao: `Contato ${c.nome} cadastrado.`, contatoId: c.id, empresaId: c.empresaId, usuarioId: ctx.usuario.id });
        await emitirEvento("contato.criado", { contatoId: c.id, empresaId: c.empresaId }, undefined, tx);
        return c;
      }),
    ),

  atualizarContato: comPermissao("crm:escrever")
    .input(contatoInput.partial().extend({ id: z.string().uuid(), versao: versaoInput }))
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const { id, versao, ...campos } = input;
        const [c] = await tx
          .update(contato)
          .set({ ...campos, versao: sql`${contato.versao} + 1`, atualizadoEm: new Date() })
          .where(and(eq(contato.id, id), eq(contato.versao, versao), isNull(contato.anonimizadoEm)))
          .returning();
        if (!c) throw conflitoDeVersao();
        await tx.insert(interacao).values({ tipo: "alteracao", descricao: `Contato alterado: ${Object.keys(campos).join(", ")}.`, contatoId: id, empresaId: c.empresaId, usuarioId: ctx.usuario.id });
        return c;
      }),
    ),

  // Opt-out é idempotente e não exige versão: descadastrar duas vezes tem o mesmo efeito.
  definirDescadastro: comPermissao("crm:escrever")
    .input(z.object({ id: z.string().uuid(), descadastrado: z.boolean() }))
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const [antes] = await tx.select().from(contato).where(eq(contato.id, input.id));
        if (!antes) throw new TRPCError({ code: "NOT_FOUND", message: "Contato não encontrado." });
        if (antes.descadastrado === input.descadastrado) return antes;
        if (antes.anonimizadoEm && !input.descadastrado) throw new TRPCError({ code: "BAD_REQUEST", message: "Contato anonimizado não pode ser reativado." });
        const [c] = await tx.update(contato).set({ descadastrado: input.descadastrado, versao: sql`${contato.versao} + 1`, atualizadoEm: new Date() }).where(eq(contato.id, input.id)).returning();
        await tx.insert(interacao).values({ tipo: "alteracao", descricao: input.descadastrado ? "Contato descadastrado (opt-out): follow-ups automáticos bloqueados." : "Opt-out removido.", contatoId: c.id, empresaId: c.empresaId, usuarioId: ctx.usuario.id });
        if (input.descadastrado) await emitirEvento("contato.descadastrado", { contatoId: c.id }, undefined, tx);
        return c;
      }),
    ),

  arquivarContato: comPermissao("crm:arquivar")
    .input(z.object({ id: z.string().uuid(), arquivar: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [c] = await db.update(contato).set({ arquivadoEm: input.arquivar ? new Date() : null, versao: sql`${contato.versao} + 1` }).where(eq(contato.id, input.id)).returning();
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contato não encontrado." });
      await auditar(ctx.usuario.id, input.arquivar ? "contato.arquivar" : "contato.desarquivar", "contato", c.id);
      return c;
    }),

  // Atendimento a pedido de exclusão de dados pessoais: remove identificação, mantém métricas agregadas.
  anonimizarContato: comPermissao("dados:anonimizar")
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      db.transaction(async (tx) => {
        const [c] = await tx
          .update(contato)
          .set({ nome: "Contato anonimizado", email: null, telefone: null, cargo: null, descadastrado: true, anonimizadoEm: new Date(), arquivadoEm: new Date(), versao: sql`${contato.versao} + 1` })
          .where(and(eq(contato.id, input.id), isNull(contato.anonimizadoEm)))
          .returning();
        if (!c) throw new TRPCError({ code: "BAD_REQUEST", message: "Contato inexistente ou já anonimizado." });
        // Textos livres podem conter dados pessoais: são substituídos.
        await tx.update(interacao).set({ descricao: "[conteúdo removido por anonimização]" }).where(and(eq(interacao.contatoId, c.id), ne(interacao.tipo, "alteracao")));
        await auditar(ctx.usuario.id, "contato.anonimizar", "contato", c.id, undefined, tx);
        return { ok: true };
      }),
    ),
});
