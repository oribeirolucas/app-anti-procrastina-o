// Seed: cria o admin inicial e as etapas padrão do pipeline (idempotente).
// Com --ficticios, adiciona dados de exemplo marcados com "[FICTÍCIO]" (só desenvolvimento).
import { eq, sql } from "drizzle-orm";
import { hashSenha } from "../auth/sessao.js";
import { db, pool } from "./index.js";
import { categoriaFinanceira, contato, empresa, etapaPipeline, oportunidade, tarefa, usuario } from "./schema.js";

export const ETAPAS_PADRAO = [
  { nome: "Lead", ordem: 1, tipo: "aberta", probabilidade: 10 },
  { nome: "Contato feito", ordem: 2, tipo: "aberta", probabilidade: 20 },
  { nome: "Demonstração", ordem: 3, tipo: "aberta", probabilidade: 50 },
  { nome: "Proposta", ordem: 4, tipo: "aberta", probabilidade: 70 },
  { nome: "Ganha", ordem: 5, tipo: "ganha", probabilidade: 100 },
  { nome: "Perdida", ordem: 6, tipo: "perdida", probabilidade: 0 },
] as const;

// "Mensalidades" e "Setup" são usadas pela geração automática de cobranças.
export const CATEGORIAS_PADRAO = [
  ...["Mensalidades", "Setup", "Outras receitas"].map((nome) => ({ nome, tipo: "receita" })),
  ...["Infraestrutura", "IA e APIs", "WhatsApp API", "Marketing", "Impostos", "Pró-labore", "Ferramentas", "Outras despesas"].map((nome) => ({ nome, tipo: "despesa" })),
];

export async function seedBase(adminEmail: string, adminSenha: string) {
  await db.insert(categoriaFinanceira).values(CATEGORIAS_PADRAO).onConflictDoNothing();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(etapaPipeline);
  if (n === 0) await db.insert(etapaPipeline).values([...ETAPAS_PADRAO]);
  const existe = await db.select({ id: usuario.id }).from(usuario).where(eq(usuario.email, adminEmail));
  if (!existe.length) await db.insert(usuario).values({ nome: "Administrador", email: adminEmail, perfil: "admin", senhaHash: await hashSenha(adminSenha) });
}

async function seedFicticios() {
  const [admin] = await db.select().from(usuario).where(eq(usuario.perfil, "admin")).limit(1);
  const etapas = await db.select().from(etapaPipeline).orderBy(etapaPipeline.ordem);
  const clinicas = [
    ["[FICTÍCIO] Clínica Sorriso Pleno", "odontologia", "São Paulo", "SP"],
    ["[FICTÍCIO] Estética Bella Pele", "estetica", "Campinas", "SP"],
    ["[FICTÍCIO] Fisio Movimento", "fisioterapia", "Curitiba", "PR"],
    ["[FICTÍCIO] Espaço Mente Leve", "psicologia", "Belo Horizonte", "MG"],
  ] as const;
  for (const [i, [nome, segmento, cidade, uf]] of clinicas.entries()) {
    const [e] = await db.insert(empresa).values({ nome, segmento, cidade, uf, responsavelId: admin.id, telefone: "(11) 90000-000" + i }).returning();
    const [c] = await db.insert(contato).values({ nome: `[FICTÍCIO] Dra. Exemplo ${i + 1}`, email: `exemplo${i + 1}@exemplo.invalid`, empresaId: e.id, cargo: "Sócia" }).returning();
    const etapa = etapas[i % 4];
    const [o] = await db.insert(oportunidade).values({ titulo: `Plano Pro — ${nome.replace("[FICTÍCIO] ", "")}`, empresaId: e.id, contatoId: c.id, etapaId: etapa.id, situacao: etapa.tipo, responsavelId: admin.id, origem: "ligacao", valor: "597.00" }).returning();
    await db.insert(tarefa).values({ titulo: "Ligar para retomar conversa", oportunidadeId: o.id, empresaId: e.id, responsavelId: admin.id, venceEm: new Date(Date.now() + (i - 1) * 86400_000) });
  }
}

const executandoDireto = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (executandoDireto) {
  const email = process.env.ADMIN_EMAIL;
  const senha = process.env.ADMIN_SENHA;
  if (!email || !senha) { console.error("Defina ADMIN_EMAIL e ADMIN_SENHA no .env."); process.exit(1); }
  await seedBase(email.toLowerCase(), senha);
  if (process.argv.includes("--ficticios")) await seedFicticios();
  console.log("Seed concluído.");
  await pool.end();
}
