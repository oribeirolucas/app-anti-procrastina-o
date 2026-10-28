import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { contato, contrato, conversa, empresa, etapaPipeline, lancamento, mensagem, oportunidade, plano } from "../db/schema.js";
import type { Turno } from "./llmService.js";

export const LIMITE_HISTORICO = 15;

/** Dados do CRM que o roteador e o prompt usam. */
export type ContextoCRM = {
  conversaId: string;
  contato: { id: string; nome: string; empresa: string | null; descadastrado: boolean } | null;
  oportunidade: { id: string; versao: number; titulo: string; etapa: string; etapaOrdem: number; valor: string; situacao: string } | null;
  contratosAtivos: { plano: string; valorMensal: string; inicio: string; fim: string | null }[];
  historicoCompras: { descricao: string; valor: string; situacao: string; vencimento: string }[];
  planos: { nome: string; valorMensal: string; valorSetup: string; descricao: string | null }[];
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
  const planos = await db.select({ nome: plano.nome, valorMensal: plano.valorMensal, valorSetup: plano.valorSetup, descricao: plano.descricao }).from(plano).where(eq(plano.ativo, true)).orderBy(plano.ordem);
  if (!c?.contatoId) return { conversaId, contato: null, oportunidade: null, contratosAtivos: [], historicoCompras: [], planos };

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
  if (ctx.planos.length) l.push("Planos e preços oficiais: " + ctx.planos.map((p) => `${p.nome}: ${br(p.valorMensal)}/mês, setup ${br(p.valorSetup)}${p.descricao ? ` (${p.descricao})` : ""}`).join("; "));
  else l.push("Planos e preços oficiais: não cadastrados. Não informe valores; encaminhe para a equipe.");
  return l.join("\n");
}
