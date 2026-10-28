import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { agente, execucaoAgente } from "../../db/schema.js";
import { auditar } from "../../lib/auditoria.js";
import { conflitoDeVersao } from "../../lib/integridade.js";
import { comPermissao, router } from "../trpc.js";

export const AREAS = ["marketing", "comercial", "cs", "financeiro"] as const;
// Agentes conversam com Claude. A OpenAI entra só na transcrição de áudio (não é escolhível aqui).
export const PROVEDORES = ["anthropic"] as const;

const dados = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(80),
  area: z.enum(AREAS),
  systemPrompt: z.string().max(20_000, "Prompt muito longo (máx. 20 mil caracteres)."),
  provedor: z.enum(PROVEDORES),
  modelo: z.string().trim().min(2, "Informe o modelo.").max(60).regex(/^[\w.\-:/]+$/, "Use o ID do modelo, sem espaços."),
  ativo: z.boolean(),
});

export const agentesRouter = router({
  listar: comPermissao("agente:gerir").query(() => db.select().from(agente).orderBy(asc(agente.area), asc(agente.nome))),

  salvar: comPermissao("agente:gerir")
    .input(dados.extend({ id: z.string().uuid().optional(), versao: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, versao, ...campos } = input;
      if (!id) {
        const [a] = await db.insert(agente).values(campos).returning();
        await auditar(ctx.usuario.id, "agente.criar", "agente", a.id, { nome: a.nome, area: a.area, provedor: a.provedor, modelo: a.modelo });
        return a;
      }
      if (versao === undefined) throw new TRPCError({ code: "BAD_REQUEST", message: "Versão obrigatória para editar." });
      const [antes] = await db.select().from(agente).where(eq(agente.id, id));
      if (!antes) throw new TRPCError({ code: "NOT_FOUND", message: "Agente não encontrado." });
      const [a] = await db.update(agente).set({ ...campos, versao: versao + 1, atualizadoEm: new Date() }).where(and(eq(agente.id, id), eq(agente.versao, versao))).returning();
      if (!a) throw conflitoDeVersao();
      // Mudança de prompt/modelo altera o comportamento do agente: fica registrada com o antes e o depois
      await auditar(ctx.usuario.id, "agente.atualizar", "agente", id, {
        antes: { provedor: antes.provedor, modelo: antes.modelo, ativo: antes.ativo, systemPrompt: antes.systemPrompt },
        depois: { provedor: a.provedor, modelo: a.modelo, ativo: a.ativo, systemPrompt: a.systemPrompt },
      });
      return a;
    }),

  execucoes: comPermissao("agente:gerir")
    .input(z.object({ agenteId: z.string().uuid() }))
    .query(({ input }) => db.select().from(execucaoAgente).where(eq(execucaoAgente.agenteId, input.agenteId)).orderBy(desc(execucaoAgente.criadoEm)).limit(100)),
});
