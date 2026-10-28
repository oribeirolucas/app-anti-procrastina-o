import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { plano } from "../db/schema.js";
import { auditar } from "../lib/auditoria.js";
import { normalizarValorBR, paraCentavos } from "../lib/dinheiro.js";
import { conflitoDeVersao } from "../lib/integridade.js";
import { comPermissao, router } from "./trpc.js";

const valor = (min: 0 | 1) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      try { return normalizarValorBR(String(v)); }
      catch { ctx.addIssue({ code: "custom", message: "Valor inválido." }); return z.NEVER; }
    })
    .refine((v) => paraCentavos(v) >= min, min ? "O valor precisa ser maior que zero." : "O valor não pode ser negativo.");

const dados = z.object({
  nome: z.string().trim().min(2, "Informe o nome do plano.").max(60),
  valorMensal: valor(1),
  valorSetup: valor(0).default("0"),
  descricao: z.string().trim().max(300).optional().nullable(),
  ativo: z.boolean().default(true),
  ordem: z.number().int().min(0).max(999).default(0),
});

export const planosRouter = router({
  // Quem registra contrato precisa ver o catálogo; inativos só aparecem para quem gerencia.
  listar: comPermissao("crm:ler")
    .input(z.object({ incluirInativos: z.boolean().default(false) }).prefault({}))
    .query(({ input }) =>
      db.select().from(plano).where(input.incluirInativos ? undefined : eq(plano.ativo, true)).orderBy(asc(plano.ordem), asc(plano.nome)),
    ),

  criar: comPermissao("config:gerir")
    .input(dados)
    .mutation(async ({ ctx, input }) => {
      const [p] = await db.insert(plano).values(input).returning();
      await auditar(ctx.usuario.id, "plano.criar", "plano", p.id, { nome: p.nome, valorMensal: p.valorMensal, valorSetup: p.valorSetup });
      return p;
    }),

  atualizar: comPermissao("config:gerir")
    .input(dados.extend({ id: z.string().uuid(), versao: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { id, versao, ...campos } = input;
      const [atual] = await db.select().from(plano).where(eq(plano.id, id));
      if (!atual) throw new TRPCError({ code: "NOT_FOUND", message: "Plano não encontrado." });
      const [p] = await db
        .update(plano)
        .set({ ...campos, versao: versao + 1, atualizadoEm: new Date() })
        .where(and(eq(plano.id, id), eq(plano.versao, versao)))
        .returning();
      if (!p) throw conflitoDeVersao();
      await auditar(ctx.usuario.id, "plano.atualizar", "plano", id, { antes: { nome: atual.nome, valorMensal: atual.valorMensal, valorSetup: atual.valorSetup, ativo: atual.ativo }, depois: campos });
      return p;
    }),
});
