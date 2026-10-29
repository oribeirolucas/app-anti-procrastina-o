import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { unidade } from "../../db/schema.js";
import { auditar } from "../../lib/auditoria.js";
import { conflitoDeVersao } from "../../lib/integridade.js";
import { comPermissao, router } from "../trpc.js";

// Plano Rede: até 3 unidades ativas por instalação (contrato maior → aumentar pela variável LIMITE_UNIDADES)
export const limiteUnidades = () => Number(process.env.LIMITE_UNIDADES) || 3;

const dados = z.object({
  nome: z.string().trim().min(2, "Informe o nome da unidade.").max(80),
  numeroId: z.string().trim().regex(/^\d{5,40}$/, "Use o Phone number ID da Meta (só números)."),
  numeroExibicao: z.string().trim().max(30).optional().nullable(),
  informacoes: z.string().max(5000, "Máximo de 5.000 caracteres.").default(""),
  ativa: z.boolean().default(true),
});

async function garantirLimite(excetoId?: string) {
  const [{ n }] = await db.select({ n: count() }).from(unidade).where(and(eq(unidade.ativa, true), excetoId ? ne(unidade.id, excetoId) : undefined));
  if (n >= limiteUnidades()) throw new TRPCError({ code: "BAD_REQUEST", message: `Limite de ${limiteUnidades()} unidades ativas atingido. Desative uma unidade ou fale com o suporte.` });
}

export const unidadesRouter = router({
  listar: comPermissao("crm:ler").query(() => db.select().from(unidade).orderBy(asc(unidade.nome))),

  salvar: comPermissao("config:gerir")
    .input(dados.extend({ id: z.string().uuid().optional(), versao: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, versao, ...campos } = input;
      if (!id) {
        if (campos.ativa) await garantirLimite();
        const [u] = await db.insert(unidade).values(campos).returning();
        await auditar(ctx.usuario.id, "unidade.criar", "unidade", u.id, { nome: u.nome, numeroId: u.numeroId });
        return u;
      }
      if (versao === undefined) throw new TRPCError({ code: "BAD_REQUEST", message: "Versão obrigatória para editar." });
      if (campos.ativa) await garantirLimite(id);
      const [u] = await db.update(unidade).set({ ...campos, versao: versao + 1, atualizadoEm: new Date() }).where(and(eq(unidade.id, id), eq(unidade.versao, versao))).returning();
      if (!u) throw conflitoDeVersao();
      await auditar(ctx.usuario.id, "unidade.atualizar", "unidade", id, campos);
      return u;
    }),
});
