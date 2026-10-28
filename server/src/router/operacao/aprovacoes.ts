import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { agente, solicitacaoAprovacao, usuario } from "../../db/schema.js";
import { auditar } from "../../lib/auditoria.js";
import { conflitoDeVersao } from "../../lib/integridade.js";
import { comPermissao, router } from "../trpc.js";

export const aprovacoesRouter = router({
  listar: comPermissao("aprovacoes:ver")
    .input(z.object({ situacao: z.enum(["pendente", "aprovada", "recusada"]).default("pendente") }).prefault({}))
    .query(async ({ input }) => {
      const itens = await db
        .select({
          id: solicitacaoAprovacao.id, versao: solicitacaoAprovacao.versao, tipo: solicitacaoAprovacao.tipo, titulo: solicitacaoAprovacao.titulo,
          descricao: solicitacaoAprovacao.descricao, valor: solicitacaoAprovacao.valor, situacao: solicitacaoAprovacao.situacao,
          criadoEm: solicitacaoAprovacao.criadoEm, decididoEm: solicitacaoAprovacao.decididoEm, motivoDecisao: solicitacaoAprovacao.motivoDecisao,
          agente: agente.nome, area: agente.area, decididoPor: usuario.nome,
        })
        .from(solicitacaoAprovacao)
        .leftJoin(agente, eq(agente.id, solicitacaoAprovacao.agenteId))
        .leftJoin(usuario, eq(usuario.id, solicitacaoAprovacao.decididoPorId))
        .where(eq(solicitacaoAprovacao.situacao, input.situacao))
        .orderBy(input.situacao === "pendente" ? solicitacaoAprovacao.criadoEm : desc(solicitacaoAprovacao.decididoEm))
        .limit(200);
      const [{ pendentes }] = await db.select({ pendentes: sql<number>`count(*)::int` }).from(solicitacaoAprovacao).where(eq(solicitacaoAprovacao.situacao, "pendente"));
      return { itens, pendentes };
    }),

  decidir: comPermissao("aprovacoes:decidir")
    .input(
      z
        .object({ id: z.string().uuid(), versao: z.number().int(), decisao: z.enum(["aprovar", "recusar"]), motivo: z.string().trim().max(300).optional() })
        .refine((v) => v.decisao === "aprovar" || (v.motivo?.length ?? 0) >= 3, { message: "Informe o motivo da recusa.", path: ["motivo"] }),
    )
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const [s] = await tx
          .update(solicitacaoAprovacao)
          .set({
            situacao: input.decisao === "aprovar" ? "aprovada" : "recusada",
            decididoPorId: ctx.usuario.id, decididoEm: new Date(), motivoDecisao: input.motivo || null, versao: input.versao + 1,
          })
          .where(and(eq(solicitacaoAprovacao.id, input.id), eq(solicitacaoAprovacao.versao, input.versao), eq(solicitacaoAprovacao.situacao, "pendente")))
          .returning();
        if (!s) {
          const [atual] = await tx.select({ situacao: solicitacaoAprovacao.situacao }).from(solicitacaoAprovacao).where(eq(solicitacaoAprovacao.id, input.id));
          if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Solicitação não encontrada." });
          if (atual.situacao !== "pendente") throw new TRPCError({ code: "CONFLICT", message: "Esta solicitação já foi decidida." });
          throw conflitoDeVersao();
        }
        await auditar(ctx.usuario.id, `aprovacao.${s.situacao}`, "solicitacao_aprovacao", s.id, { tipo: s.tipo, titulo: s.titulo, valor: s.valor, motivo: s.motivoDecisao }, tx);
        return s;
      });
    }),
});
