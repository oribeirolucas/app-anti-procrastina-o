import { z } from "zod";

// Catálogo de gatilhos: cada um corresponde a um tipo de evento da fila (lib/eventos.ts).
export const GATILHOS = {
  "empresa.criada": "Empresa cadastrada",
  "contato.criado": "Contato cadastrado",
  "oportunidade.criada": "Oportunidade criada",
  "oportunidade.etapa_alterada": "Oportunidade mudou de etapa",
  "oportunidade.encerrada": "Oportunidade ganha ou perdida",
  "contrato.criado": "Contrato registrado",
  "contrato.vencendo": "Contrato perto do vencimento (agendado)",
  "lead.captado": "Lead recebido por origem de captação",
} as const;
export type Gatilho = keyof typeof GATILHOS;
export const gatilhoSchema = z.enum(Object.keys(GATILHOS) as [Gatilho, ...Gatilho[]]);

// Todas opcionais; as ausentes não filtram. Avaliadas sobre o contexto do evento (oportunidade, contrato…).
export const condicoesSchema = z
  .object({
    etapaId: z.string().uuid().optional(), // etapa atual/destino da oportunidade
    situacao: z.enum(["ganha", "perdida"]).optional(), // para oportunidade.encerrada
    origem: z.string().trim().max(60).optional(), // origem da oportunidade
    valorMinimo: z.number().min(0).max(10_000_000).optional(),
    origemCaptacaoId: z.string().uuid().optional(), // para lead.captado
    diasAntes: z.number().int().min(0).max(365).optional(), // para contrato.vencendo (obrigatório nele)
  })
  .strict();
export type Condicoes = z.infer<typeof condicoesSchema>;

const destino = z.enum(["responsavel_registro", "gestores", "usuario"]);

export const acaoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("criar_tarefa"),
    titulo: z.string().trim().min(2).max(200), // aceita {empresa}, {oportunidade}, {contato}
    prazoDias: z.number().int().min(0).max(365),
    responsavel: z.enum(["responsavel_registro", "usuario"]),
    usuarioId: z.string().uuid().optional(),
  }),
  z.object({
    tipo: z.literal("notificar"),
    titulo: z.string().trim().min(2).max(200),
    destino,
    usuarioId: z.string().uuid().optional(),
  }),
  z.object({
    tipo: z.literal("iniciar_followup"),
    sequenciaId: z.string().uuid(),
  }),
]);
export type Acao = z.infer<typeof acaoSchema>;

export const acoesSchema = z
  .array(acaoSchema)
  .min(1, "Inclua ao menos uma ação.")
  .max(10)
  .superRefine((acoes, ctx) => {
    acoes.forEach((a, i) => {
      if ((a.tipo === "criar_tarefa" && a.responsavel === "usuario" && !a.usuarioId) || (a.tipo === "notificar" && a.destino === "usuario" && !a.usuarioId))
        ctx.addIssue({ code: "custom", path: [i, "usuarioId"], message: "Escolha o usuário." });
    });
  });

export const passosSchema = z
  .array(z.object({ aposDias: z.number().int().min(0).max(365), titulo: z.string().trim().min(2).max(200) }))
  .min(1, "Inclua ao menos um passo.")
  .max(20);

// Gatilhos cujo contexto tem oportunidade (necessário para follow-up e filtros de etapa/origem/valor).
export const GATILHOS_COM_OPORTUNIDADE: Gatilho[] = ["oportunidade.criada", "oportunidade.etapa_alterada", "oportunidade.encerrada", "lead.captado"];

export const MAX_TENTATIVAS = 5;
