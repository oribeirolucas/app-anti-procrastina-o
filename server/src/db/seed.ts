// Seed: cria o admin inicial e as etapas padrão do pipeline (idempotente).
// Com --ficticios, adiciona dados de exemplo marcados com "[FICTÍCIO]" (só desenvolvimento).
import { eq, sql } from "drizzle-orm";
import { hashSenha } from "../auth/sessao.js";
import { db, pool } from "./index.js";
import { categoriaFinanceira, contato, empresa, etapaPipeline, oportunidade, plano, tarefa, usuario } from "./schema.js";

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
  ...["Infraestrutura", "Fornecedores", "Marketing", "Impostos", "Pessoal e pró-labore", "Ferramentas", "Outras despesas"].map((nome) => ({ nome, tipo: "despesa" })),
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
  const planos = [
    { nome: "[FICTÍCIO] Básico", valorMensal: "199.00", valorSetup: "0", ordem: 1 },
    { nome: "[FICTÍCIO] Profissional", valorMensal: "499.00", valorSetup: "300.00", ordem: 2 },
  ];
  await db.insert(plano).values(planos).onConflictDoNothing();
  const empresas = [
    ["[FICTÍCIO] Comercial Horizonte", "varejo", "São Paulo", "SP"],
    ["[FICTÍCIO] Construtora Pilar", "construção", "Campinas", "SP"],
    ["[FICTÍCIO] Escritório Alfa Contábil", "serviços", "Curitiba", "PR"],
    ["[FICTÍCIO] Distribuidora Rota Sul", "distribuição", "Porto Alegre", "RS"],
  ] as const;
  for (const [i, [nome, segmento, cidade, uf]] of empresas.entries()) {
    const [e] = await db.insert(empresa).values({ nome, segmento, cidade, uf, responsavelId: admin.id, telefone: "(11) 90000-000" + i }).returning();
    const [c] = await db.insert(contato).values({ nome: `[FICTÍCIO] Contato Exemplo ${i + 1}`, email: `exemplo${i + 1}@exemplo.invalid`, empresaId: e.id, cargo: "Sócio(a)" }).returning();
    const etapa = etapas[i % 4];
    const p = planos[i % 2];
    const [o] = await db.insert(oportunidade).values({ titulo: `${p.nome.replace("[FICTÍCIO] ", "")} — ${nome.replace("[FICTÍCIO] ", "")}`, empresaId: e.id, contatoId: c.id, etapaId: etapa.id, situacao: etapa.tipo, responsavelId: admin.id, origem: "ligacao", valor: p.valorMensal }).returning();
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
