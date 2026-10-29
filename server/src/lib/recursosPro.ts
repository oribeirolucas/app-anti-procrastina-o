import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { configuracao } from "../db/schema.js";

// Nome de modelo da Meta: minúsculas, números e "_" (como no Gerenciador do WhatsApp)
const nomeModelo = z.string().trim().regex(/^[a-z0-9_]{1,120}$/, "Use o nome exato do modelo aprovado (minúsculas, números e _).");

/** Configuração dos recursos do plano Pro desta instalação. Tudo começa desligado. */
export const recursosProSchema = z.object({
  idiomaModelos: z.string().trim().min(2).max(10).default("pt_BR"),
  retomada: z.object({
    ativo: z.boolean().default(false),
    // 1º lembrete dentro da janela de 24h do WhatsApp: texto livre
    horasPasso1: z.number().int().min(1).max(23).default(20),
    textoPasso1: z.string().trim().min(5).max(500).default("Oi, {nome}! Conseguiu ver minha última mensagem? Se quiser, te ajudo a escolher o melhor horário."),
    // 2º lembrete fora da janela: só com modelo aprovado ({{1}} = primeiro nome)
    horasPasso2: z.number().int().min(24).max(240).default(72),
    modeloPasso2: nomeModelo.or(z.literal("")).default(""),
  }).prefault({}),
  confirmacao: z.object({
    ativo: z.boolean().default(false),
    horaEnvio: z.number().int().min(6).max(21).default(10), // hora local do envio, na véspera
    // {{1}} nome, {{2}} data, {{3}} hora, {{4}} procedimento
    modelo: nomeModelo.or(z.literal("")).default(""),
  }).prefault({}),
  reativacao: z.object({
    // {{1}} = primeiro nome
    modelo: nomeModelo.or(z.literal("")).default(""),
  }).prefault({}),
});
export type RecursosPro = z.infer<typeof recursosProSchema>;

export async function obterRecursosPro(): Promise<RecursosPro> {
  const [c] = await db.select().from(configuracao).where(eq(configuracao.chave, "recursos_pro"));
  const r = recursosProSchema.safeParse(c?.valor ?? {});
  return r.success ? r.data : recursosProSchema.parse({});
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;
