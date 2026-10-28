import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { configuracao, contato, contrato, conversa, empresa, etapaPipeline, lancamento, mensagem, oportunidade, plano } from "../db/schema.js";
import type { Turno } from "./llmService.js";

export const LIMITE_HISTORICO = 15;

export type PlanoOferta = {
  nome: string; valorMensal: string; valorSetup: string; descricao: string | null;
  promessa: string | null; publicoIdeal: string | null; franquiaConversas: number | null; entregaveis: { item: string; disponivel: boolean }[];
};
const colunasOferta = {
  nome: plano.nome, valorMensal: plano.valorMensal, valorSetup: plano.valorSetup, descricao: plano.descricao,
  promessa: plano.promessa, publicoIdeal: plano.publicoIdeal, franquiaConversas: plano.franquiaConversas, entregaveis: plano.entregaveis,
};
/** Planos ativos com a oferta completa (mesma fonte para agentes e site). */
export const planosAtivos = () => db.select(colunasOferta).from(plano).where(eq(plano.ativo, true)).orderBy(plano.ordem);

/** Dados do CRM que o roteador e o prompt usam. */
export type ContextoCRM = {
  conversaId: string;
  contato: { id: string; nome: string; empresa: string | null; descadastrado: boolean } | null;
  oportunidade: { id: string; versao: number; titulo: string; etapa: string; etapaOrdem: number; valor: string; situacao: string } | null;
  contratosAtivos: { plano: string; valorMensal: string; inicio: string; fim: string | null }[];
  historicoCompras: { descricao: string; valor: string; situacao: string; vencimento: string }[];
  planos: PlanoOferta[];
  baseConhecimento: string;
};

/** Últimas mensagens da conversa (mais antigas primeiro), no formato de turnos para o LLM. */
export async function buscarHistorico(conversaId: string, limite = LIMITE_HISTORICO): Promise<Turno[]> {
  const ultimas = await db
    .select({ autor: mensagem.autor, texto: mensagem.texto })
    .from(mensagem)
    .where(eq(mensagem.conversaId, conversaId))
    .orderBy(desc(mensagem.criadoEm))
    .limit(limite);
  return ultimas.reverse().map((m) => ({ papel: m.autor === "cliente" ? "cliente" : "agente", texto: m.texto }));
}

/** Metadados do lead/cliente: nome, etapa, valor da oportunidade, contratos e histórico de cobranças. */
export async function buscarContextoCRM(conversaId: string): Promise<ContextoCRM> {
  const [c] = await db
    .select({ contatoId: contato.id, nome: contato.nome, descadastrado: contato.descadastrado, empresaId: contato.empresaId, empresa: empresa.nome })
    .from(conversa)
    .leftJoin(contato, eq(contato.id, conversa.contatoId))
    .leftJoin(empresa, eq(empresa.id, contato.empresaId))
    .where(eq(conversa.id, conversaId));
  const planos = await planosAtivos();
  const [base] = await db.select().from(configuracao).where(eq(configuracao.chave, "base_conhecimento"));
  const baseConhecimento = typeof base?.valor === "string" ? base.valor : "";
  if (!c?.contatoId) return { conversaId, contato: null, oportunidade: null, contratosAtivos: [], historicoCompras: [], planos, baseConhecimento };

  // Oportunidade mais recente do contato (ou da empresa dele) que não esteja arquivada
  const donos = [eq(oportunidade.contatoId, c.contatoId), ...(c.empresaId ? [eq(oportunidade.empresaId, c.empresaId)] : [])];
  const [o] = await db
    .select({ id: oportunidade.id, versao: oportunidade.versao, titulo: oportunidade.titulo, etapa: etapaPipeline.nome, etapaOrdem: etapaPipeline.ordem, valor: oportunidade.valor, situacao: oportunidade.situacao })
    .from(oportunidade)
    .innerJoin(etapaPipeline, eq(etapaPipeline.id, oportunidade.etapaId))
    .where(and(isNull(oportunidade.arquivadoEm), or(...donos)))
    .orderBy(desc(oportunidade.criadoEm))
    .limit(1);

  const contratosAtivos = c.empresaId
    ? await db.select({ plano: contrato.plano, valorMensal: contrato.valorMensal, inicio: contrato.inicio, fim: contrato.fim }).from(contrato).where(and(eq(contrato.empresaId, c.empresaId), eq(contrato.situacao, "ativo")))
    : [];
  const historicoCompras = c.empresaId
    ? await db
        .select({ descricao: lancamento.descricao, valor: lancamento.valor, situacao: lancamento.situacao, vencimento: lancamento.vencimento })
        .from(lancamento)
        .where(and(eq(lancamento.empresaId, c.empresaId), eq(lancamento.tipo, "receita"), inArray(lancamento.situacao, ["pendente", "pago"])))
        .orderBy(desc(lancamento.vencimento))
        .limit(6)
    : [];
  return {
    conversaId,
    contato: { id: c.contatoId, nome: c.nome!, empresa: c.empresa, descadastrado: !!c.descadastrado },
    oportunidade: o ?? null,
    contratosAtivos,
    historicoCompras,
    planos,
    baseConhecimento,
  };
}

const br = (v: string) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
const dataBR = (d: string) => d.split("-").reverse().join("/");

/** Bloco de texto injetado no prompt antes da conversa. Só dados verificáveis do CRM, sem telefone ou e-mail. */
export function formatarContexto(ctx: ContextoCRM, hoje: string): string {
  const l: string[] = [`Data de hoje: ${dataBR(hoje)}`];
  if (!ctx.contato) l.push("Contato: novo, ainda sem cadastro.");
  else l.push(`Contato: ${ctx.contato.nome}${ctx.contato.empresa ? ` (empresa: ${ctx.contato.empresa})` : ""}`);
  if (ctx.oportunidade) l.push(`Oportunidade: ${ctx.oportunidade.titulo} · etapa "${ctx.oportunidade.etapa}" · valor mensal estimado ${br(ctx.oportunidade.valor)} · situação ${ctx.oportunidade.situacao}`);
  else l.push("Oportunidade: nenhuma.");
  if (ctx.contratosAtivos.length) l.push("Contratos ativos: " + ctx.contratosAtivos.map((x) => `${x.plano} ${br(x.valorMensal)}/mês desde ${dataBR(x.inicio)}${x.fim ? ` até ${dataBR(x.fim)}` : ""}`).join("; "));
  else l.push("Contratos ativos: nenhum (não é cliente pagante).");
  if (ctx.historicoCompras.length) l.push("Últimas cobranças: " + ctx.historicoCompras.map((x) => `${x.descricao} ${br(x.valor)} venc. ${dataBR(x.vencimento)} (${x.situacao})`).join("; "));
  if (ctx.planos.length) {
    l.push("Planos e preços oficiais (só ofereça o que está em \"Entrega hoje\"; o que está \"Em construção\" NÃO pode ser vendido nem prometido, e não informe data):");
    for (const p of ctx.planos) {
      const hoje = p.entregaveis.filter((e) => e.disponivel).map((e) => e.item);
      const breve = p.entregaveis.filter((e) => !e.disponivel).map((e) => e.item);
      l.push(`- ${p.nome}: ${br(p.valorMensal)}/mês, setup ${br(p.valorSetup)}${p.promessa ? ` · promessa: ${p.promessa}` : ""}${p.publicoIdeal ? ` · para: ${p.publicoIdeal}` : ""}${p.franquiaConversas ? ` · até ${p.franquiaConversas} conversas/mês` : ""}`);
      if (hoje.length) l.push(`  Entrega hoje: ${hoje.join("; ")}`);
      else if (p.descricao) l.push(`  Inclui: ${p.descricao}`);
      if (breve.length) l.push(`  Em construção (não vender): ${breve.join("; ")}`);
    }
  }
  else l.push("Planos e preços oficiais: não cadastrados. Não informe valores; encaminhe para a equipe.");
  // Base de conhecimento no fim, separada dos dados do lead
  l.push(ctx.baseConhecimento.trim() ? `\nBase de conhecimento da empresa (oferta, políticas e respostas aprovadas):\n${ctx.baseConhecimento.trim()}` : "\nBase de conhecimento da empresa: vazia. Para perguntas sobre o produto, diga que vai confirmar com a equipe.");
  return l.join("\n");
}
