import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { agente, contato, conversa, mensagem, unidade } from "../../db/schema.js";
import { comPermissao, router } from "../trpc.js";

export const inboxRouter = router({
  conversas: comPermissao("agente:atender")
    .input(z.object({ situacao: z.enum(["ativas", "encerrada"]).default("ativas"), unidadeId: z.string().uuid().optional() }).prefault({}))
    .query(async ({ input }) => {
      const filtro = input.situacao === "ativas" ? inArray(conversa.situacao, ["ia", "humano"]) : eq(conversa.situacao, "encerrada");
      return db
        .select({
          id: conversa.id, canal: conversa.canal, nome: sql<string>`coalesce(${contato.nome}, ${conversa.nomeExibicao}, 'Sem nome')`,
          situacao: conversa.situacao, ultimaMensagemEm: conversa.ultimaMensagemEm, agente: agente.nome, unidade: unidade.nome,
          ultima: sql<string | null>`(select texto from mensagem m where m.conversa_id = ${conversa.id} order by m.criado_em desc limit 1)`,
        })
        .from(conversa)
        .leftJoin(contato, eq(contato.id, conversa.contatoId))
        .leftJoin(agente, eq(agente.id, conversa.agenteId))
        .leftJoin(unidade, eq(unidade.id, conversa.unidadeId))
        .where(and(filtro, input.unidadeId ? eq(conversa.unidadeId, input.unidadeId) : undefined))
        .orderBy(desc(conversa.ultimaMensagemEm))
        .limit(100);
    }),

  mensagens: comPermissao("agente:atender")
    .input(z.object({ conversaId: z.string().uuid() }))
    .query(({ input }) =>
      db.select({ id: mensagem.id, autor: mensagem.autor, texto: mensagem.texto, criadoEm: mensagem.criadoEm })
        .from(mensagem).where(eq(mensagem.conversaId, input.conversaId)).orderBy(asc(mensagem.criadoEm)).limit(500),
    ),
});
