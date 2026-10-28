import { and, asc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { agendamento, configuracao, contato, conversa, etapaPipeline, execucaoAgente, interacao, mensagem, notificacao, oportunidade, tarefa, usuario } from "../db/schema.js";
import { CONTRATO_DE_SAIDA, MENSAGEM_FALLBACK, REGRAS_COMUNS, type AreaAgente } from "../config/prompts.js";
import { solicitarAprovacao } from "../lib/aprovacoes.js";
import { registrarConsumo, verificarLimite } from "../lib/consumo.js";
import { hojeNoFuso, obterFuso } from "../lib/datas.js";
import { emitirEvento } from "../lib/eventos.js";
import { log } from "../lib/log.js";
import { agenteDaArea, rotear } from "./agentRouter.js";
import { buscarContextoCRM, buscarHistorico, formatarContexto, type ContextoCRM } from "./contextService.js";
import { ErroLLM, type AcaoAgente, type RegistroProvedores } from "./llmService.js";
import { ErroTranscricao, type Transcritor } from "./transcricaoService.js";
import { numeroDaConversa, type CanalWhatsApp } from "./whatsappService.js";

/** Dependências injetadas: em produção vêm do ambiente; nos testes, dublês (nada sai do sistema). */
export type DepsAtendimento = { provedores: RegistroProvedores; canal: CanalWhatsApp; transcritor: Transcritor; modeloPadrao: string };

export const PREFIXO_TRANSCRICAO = "[áudio transcrito]";
const AUDIO_SEM_TRANSCRICAO = "[o cliente enviou um áudio que não pôde ser transcrito; peça para ele escrever a mensagem]";

/**
 * Transcreve os áudios pendentes da conversa (ChatGPT/OpenAI) antes de o agente (Claude) responder.
 * Falha não trava o atendimento: o agente recebe um aviso e pede para o cliente escrever.
 */
export async function transcreverPendentes(conversaId: string, deps: DepsAtendimento, contatoId?: string | null) {
  const audios = await db.select({ id: mensagem.id, midiaId: mensagem.midiaId }).from(mensagem)
    .where(and(eq(mensagem.conversaId, conversaId), eq(mensagem.autor, "cliente"), eq(mensagem.midiaTipo, "audio"), isNull(mensagem.transcritaEm), isNull(mensagem.processadaEm)))
    .orderBy(asc(mensagem.criadoEm));
  for (const a of audios) {
    let texto = AUDIO_SEM_TRANSCRICAO;
    try {
      const limite = await verificarLimite("transcricao_segundos");
      if (!limite.permitido) throw new ErroTranscricao("franquia de transcrição esgotada", false);
      const midia = await deps.canal.baixarMidia(a.midiaId!);
      const r = await deps.transcritor.transcrever(midia.dados, midia.mime);
      if (r.texto) texto = `${PREFIXO_TRANSCRICAO} ${r.texto}`.slice(0, 4000);
      await registrarConsumo({ recurso: "transcricao_segundos", quantidade: r.segundos, referencia: a.id });
    } catch (e) {
      log("aviso", "atendimento.transcricao_falhou", { conversaId, erro: String(e instanceof Error ? e.message : e).slice(0, 200) });
    }
    await db.update(mensagem).set({ texto, transcritaEm: new Date() }).where(eq(mensagem.id, a.id));
    if (contatoId) await db.insert(interacao).values({ tipo: "whatsapp", contatoId, descricao: `WhatsApp · cliente (áudio): ${texto}`.slice(0, 2000), respostaDoContato: true });
  }
}

export const DESCONTO_MAXIMO_AGENTE = 10; // % que o Closer pode oferecer sem aprovação
const LEASE_MS = 120_000;
const MAX_TENTATIVAS = 3;
const RESPOSTA_APROVACAO = "Vou levar essa condição para aprovação da diretoria e te retorno assim que tiver a resposta.";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Pega a conversa para processar (lease). Retorna falso se outro processo já está nela. */
async function travar(conversaId: string): Promise<boolean> {
  const r = await db
    .update(conversa)
    .set({ processandoAte: new Date(Date.now() + LEASE_MS) })
    .where(and(eq(conversa.id, conversaId), or(isNull(conversa.processandoAte), lt(conversa.processandoAte, new Date()))))
    .returning({ id: conversa.id });
  return r.length > 0;
}
const liberar = (conversaId: string) => db.update(conversa).set({ processandoAte: null }).where(eq(conversa.id, conversaId));

/** Processa as conversas com mensagens do cliente aguardando resposta. Seguro para rodar em paralelo. */
export async function processarFila(deps: DepsAtendimento, limite = 10) {
  const pendentes = await db
    .selectDistinct({ conversaId: mensagem.conversaId })
    .from(mensagem)
    .where(and(eq(mensagem.autor, "cliente"), isNull(mensagem.processadaEm), lt(mensagem.tentativas, MAX_TENTATIVAS)))
    .limit(limite);
  let processadas = 0;
  for (const { conversaId } of pendentes) {
    if (!(await travar(conversaId))) continue;
    try {
      await processarConversa(conversaId, deps);
      processadas++;
    } catch (e) {
      // Falha inesperada (banco etc.): conta a tentativa; na última, o cliente recebe o fallback
      log("erro", "atendimento.falha", { conversaId, erro: String(e).slice(0, 300) });
      const t = await db
        .update(mensagem).set({ tentativas: sql`${mensagem.tentativas} + 1` })
        .where(and(eq(mensagem.conversaId, conversaId), eq(mensagem.autor, "cliente"), isNull(mensagem.processadaEm)))
        .returning({ tentativas: mensagem.tentativas });
      if (t.some((x) => x.tentativas >= MAX_TENTATIVAS)) await responderComFallback(conversaId, deps, "falha repetida no processamento").catch(() => {});
    } finally {
      await liberar(conversaId);
    }
  }
  return { processadas };
}

async function pendentesDa(conversaId: string) {
  return db.select({ id: mensagem.id }).from(mensagem)
    .where(and(eq(mensagem.conversaId, conversaId), eq(mensagem.autor, "cliente"), isNull(mensagem.processadaEm)))
    .orderBy(asc(mensagem.criadoEm));
}
const marcarProcessadas = (ids: string[], exec: Tx | typeof db = db) =>
  ids.length ? exec.update(mensagem).set({ processadaEm: new Date() }).where(inArray(mensagem.id, ids)) : Promise.resolve();

export async function processarConversa(conversaId: string, deps: DepsAtendimento) {
  const [conv] = await db.select().from(conversa).where(eq(conversa.id, conversaId));
  const pendentes = (await pendentesDa(conversaId)).map((m) => m.id);
  if (!conv || !pendentes.length) return;
  // Conversa com humano ou encerrada: a IA não responde (o humano vê tudo no Inbox)
  // Transcreve antes de tudo: mesmo em atendimento humano, a equipe lê o áudio como texto no Inbox
  await transcreverPendentes(conversaId, deps, conv.contatoId);
  if (conv.situacao !== "ia") { await marcarProcessadas(pendentes); return; }

  const ctx = await buscarContextoCRM(conversaId);
  const rota = rotear(ctx);
  const ag = await agenteDaArea(rota.area, deps.modeloPadrao);
  if (!ag) return responderComFallback(conversaId, deps, `nenhum agente ativo para ${rota.area}`, pendentes);

  const limite = await verificarLimite("ia_conversa");
  if (!limite.permitido) {
    await db.insert(execucaoAgente).values({ agenteId: ag.id, situacao: "bloqueada", resumo: `Franquia de conversas com IA esgotada (${limite.usado}/${limite.limite})` });
    return responderComFallback(conversaId, deps, "franquia de IA esgotada", pendentes);
  }

  const inicio = Date.now();
  const fuso = await obterFuso();
  const hoje = hojeNoFuso(fuso);
  const provedor = deps.provedores[ag.provedor];
  try {
    if (!provedor) throw new ErroLLM(`provedor ${ag.provedor} desconhecido`, false);
    const r = await provedor.gerar({
      provedor: ag.provedor,
      modelo: ag.modelo,
      system: [ag.systemPrompt, REGRAS_COMUNS, CONTRATO_DE_SAIDA].join("\n\n"),
      contexto: formatarContexto(ctx, hoje, fuso),
      historico: await buscarHistorico(conversaId),
    });
    const { resposta, efeitos } = await executarAcoes(r.saida.acoes, r.saida.resposta, { ctx, area: rota.area, agenteId: ag.id, conversaId, refBase: pendentes[pendentes.length - 1] });
    const enviada = await registrarEEnviar(conversaId, conv.idExterno, resposta, "ia", deps, { contatoId: ctx.contato?.id, agenteNome: ag.nome, pendentes });
    await db.insert(execucaoAgente).values({
      agenteId: ag.id, situacao: "ok", tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida, duracaoMs: Date.now() - inicio,
      resumo: `Respondeu (${rota.motivo})${efeitos.length ? ` · ${efeitos.join(", ")}` : ""}${enviada ? "" : " · não enviada ao WhatsApp"}`.slice(0, 300),
    });
    await registrarConsumo({ recurso: "ia_conversa", quantidade: 1, referencia: `${conversaId}:${hoje}` });
    await registrarConsumo({ recurso: "ia_tokens", quantidade: Math.max(1, r.tokensEntrada + r.tokensSaida), referencia: pendentes[pendentes.length - 1] });
    await db.update(conversa).set({ agenteId: ag.id }).where(eq(conversa.id, conversaId));
  } catch (e) {
    const erro = e instanceof ErroLLM ? e.message : String(e);
    await db.insert(execucaoAgente).values({ agenteId: ag.id, situacao: "erro", resumo: "Falha ao gerar resposta; cliente recebeu a mensagem padrão", erro: erro.slice(0, 1000), duracaoMs: Date.now() - inicio });
    log("erro", "atendimento.llm_falhou", { conversaId, agente: ag.id, erro: erro.slice(0, 200) });
    await responderComFallback(conversaId, deps, `IA indisponível: ${erro}`, pendentes);
  }
}

/** Grava a mensagem de saída, liga à timeline do contato e envia ao WhatsApp. Retorna se foi entregue à API. */
async function registrarEEnviar(conversaId: string, para: string, texto: string, autor: "ia" | "humano", deps: DepsAtendimento, o: { contatoId?: string; agenteNome?: string; pendentes: string[] }) {
  const [m] = await db.transaction(async (tx) => {
    const ins = await tx.insert(mensagem).values({ conversaId, autor, texto }).returning();
    await marcarProcessadas(o.pendentes, tx);
    await tx.update(conversa).set({ ultimaMensagemEm: new Date() }).where(eq(conversa.id, conversaId));
    if (o.contatoId) await tx.insert(interacao).values({ tipo: "whatsapp", contatoId: o.contatoId, descricao: `WhatsApp · ${o.agenteNome ?? "equipe"}: ${texto}`.slice(0, 2000) });
    return ins;
  });
  const r = await deps.canal.enviarTexto(para, texto, await numeroDaConversa(conversaId));
  await db.update(mensagem).set(r.enviado ? { enviadaEm: new Date(), idExterno: r.idExterno } : { erroEnvio: r.motivo }).where(eq(mensagem.id, m.id));
  if (r.enviado) await registrarConsumo({ recurso: "whatsapp_conversa", quantidade: 1, referencia: `${conversaId}:${hojeNoFuso(await obterFuso())}` });
  return r.enviado;
}

/** O cliente nunca fica sem resposta: mensagem padrão, conversa passa para humano e a equipe é avisada. */
async function responderComFallback(conversaId: string, deps: DepsAtendimento, motivo: string, pendentes?: string[]) {
  const ids = pendentes ?? (await pendentesDa(conversaId)).map((m) => m.id);
  const [conv] = await db.select().from(conversa).where(eq(conversa.id, conversaId));
  if (!conv) return;
  await db.update(conversa).set({ situacao: "humano" }).where(eq(conversa.id, conversaId));
  await registrarEEnviar(conversaId, conv.idExterno, MENSAGEM_FALLBACK, "ia", deps, { contatoId: conv.contatoId ?? undefined, pendentes: ids });
  await avisarEquipe(db, { titulo: "WhatsApp aguardando atendimento humano", mensagem: motivo, chave: `fallback:${conversaId}:${ids[ids.length - 1] ?? "x"}`, contatoId: conv.contatoId });
}

/** Tarefa para a equipe + aviso no sininho dos administradores (idempotente pela chave). */
async function avisarEquipe(exec: Tx | typeof db, a: { titulo: string; mensagem: string; chave: string; contatoId?: string | null; oportunidadeId?: string | null }) {
  const admins = await exec.select({ id: usuario.id }).from(usuario).where(and(eq(usuario.perfil, "admin"), eq(usuario.ativo, true)));
  if (!admins.length) return;
  const novas = await exec.insert(notificacao)
    .values(admins.map((u) => ({ usuarioId: u.id, titulo: a.titulo, mensagem: a.mensagem.slice(0, 500), link: "/inbox", chave: a.chave })))
    .onConflictDoNothing().returning({ id: notificacao.id });
  if (novas.length) await exec.insert(tarefa).values({ titulo: a.titulo, descricao: a.mensagem.slice(0, 2000), responsavelId: admins[0].id, contatoId: a.contatoId ?? null, oportunidadeId: a.oportunidadeId ?? null, venceEm: new Date(Date.now() + 2 * 3600_000), origem: "automacao" });
}

type ContextoAcao = { ctx: ContextoCRM; area: AreaAgente; agenteId: string; conversaId: string; refBase: string };

/**
 * Executa as ações pedidas pelo LLM com as regras do SISTEMA (o modelo não tem a palavra final):
 * desconto acima da alçada vira aprovação e a resposta é trocada; mover etapa só vale para o SDR no início do funil.
 */
export async function executarAcoes(acoes: AcaoAgente[], resposta: string, c: ContextoAcao) {
  const efeitos: string[] = [];
  let texto = resposta;
  for (const [i, a] of acoes.entries()) {
    const ref = `${c.refBase}:${i}`;
    switch (a.tipo) {
      case "qualificado": {
        const o = c.ctx.oportunidade;
        if (c.area !== "marketing" || !o || o.situacao !== "aberta") break;
        const etapa = await moverParaEtapaQualificado(o.id, o.versao, a.descricao ?? "Lead qualificado pela IA");
        if (etapa) efeitos.push(`lead movido para ${etapa}`);
        break;
      }
      case "oferecer_desconto": {
        const pct = a.percentual ?? 0;
        if (c.area === "comercial" && pct > 0 && pct <= DESCONTO_MAXIMO_AGENTE) { efeitos.push(`desconto de ${pct}% oferecido`); break; }
        // Fora da alçada (ou agente sem alçada): não promete; pede aprovação
        await solicitarAprovacao({ tipo: "desconto", titulo: `Desconto de ${pct}% para ${c.ctx.contato?.nome ?? "lead do WhatsApp"}`, descricao: a.descricao ?? undefined, valor: valorOuNada(a.valor), agenteId: c.agenteId, referencia: ref });
        texto = RESPOSTA_APROVACAO;
        efeitos.push(`desconto de ${pct}% enviado para aprovação`);
        break;
      }
      case "solicitar_aprovacao": {
        const tipo = c.area === "comercial" ? "desconto" : "outro";
        await solicitarAprovacao({ tipo, titulo: `${c.ctx.contato?.nome ?? "Lead do WhatsApp"}: ${(a.descricao ?? "pedido fora da alçada").slice(0, 150)}`, descricao: a.descricao ?? undefined, valor: valorOuNada(a.valor), agenteId: c.agenteId, referencia: ref });
        efeitos.push("solicitação enviada para Aprovações");
        break;
      }
      case "pedir_link_pagamento":
        // Sem integração de pagamento ainda: a equipe gera e envia o link (nenhum link é inventado)
        await avisarEquipe(db, { titulo: "Enviar link de pagamento", mensagem: `${c.ctx.contato?.nome ?? "Lead"} aceitou: ${a.descricao ?? "plano não informado"}`, chave: `pagamento:${ref}`, contatoId: c.ctx.contato?.id, oportunidadeId: c.ctx.oportunidade?.id });
        efeitos.push("pedido de link de pagamento para a equipe");
        break;
      case "risco_cancelamento":
        await avisarEquipe(db, { titulo: "Risco de cancelamento", mensagem: `${c.ctx.contato?.nome ?? "Cliente"}: ${a.descricao ?? "sem motivo informado"}`, chave: `churn:${ref}`, contatoId: c.ctx.contato?.id });
        efeitos.push("alerta de churn");
        break;
      case "transferir_humano":
        await db.update(conversa).set({ situacao: "humano" }).where(eq(conversa.id, c.conversaId));
        await avisarEquipe(db, { titulo: "Cliente pediu atendimento humano", mensagem: a.descricao ?? "", chave: `humano:${ref}`, contatoId: c.ctx.contato?.id, oportunidadeId: c.ctx.oportunidade?.id });
        efeitos.push("transferido para humano");
        break;
      case "confirmar_consulta":
      case "cancelar_consulta":
      case "remarcar_consulta": {
        const q = c.ctx.proximaConsulta;
        if (!q) break; // sem consulta no contexto: nada a atualizar (a resposta segue normalmente)
        const nova = a.tipo === "confirmar_consulta" ? "confirmado" : a.tipo === "cancelar_consulta" ? "cancelado" : "remarcar";
        const [ok] = await db.update(agendamento)
          .set({ situacao: nova, respostaEm: new Date(), observacao: a.descricao?.slice(0, 300) ?? null, versao: sql`${agendamento.versao} + 1`, atualizadoEm: new Date() })
          .where(and(eq(agendamento.id, q.id), inArray(agendamento.situacao, ["agendado", "confirmado", "remarcar"])))
          .returning({ id: agendamento.id });
        if (!ok) break;
        efeitos.push(`consulta ${nova}`);
        // Vaga liberada ou pedido de novo horário: a recepção precisa agir
        if (nova !== "confirmado") await avisarEquipe(db, { titulo: nova === "cancelado" ? "Consulta cancelada pelo paciente: vaga livre" : "Paciente pediu para remarcar", mensagem: `${c.ctx.contato?.nome ?? "Paciente"}: ${a.descricao ?? "sem detalhes"}`, chave: `agenda:${q.id}:${nova}`, contatoId: c.ctx.contato?.id });
        break;
      }
      case "descadastrar":
        if (c.ctx.contato) {
          await db.update(contato).set({ descadastrado: true, versao: sql`${contato.versao} + 1`, atualizadoEm: new Date() }).where(eq(contato.id, c.ctx.contato.id));
          await emitirEvento("contato.descadastrado", { contatoId: c.ctx.contato.id }, `descadastro:${ref}`); // encerra follow-ups
        }
        efeitos.push("contato descadastrado");
        break;
    }
  }
  return { resposta: texto, efeitos };
}

const valorOuNada = (v: string | null) => (v && /^\d+([.,]\d{1,2})?$/.test(v.trim()) ? v.trim().replace(",", ".") : undefined);

/**
 * Mesmo efeito de "Mover etapa" na tela: versão, histórico e evento (dispara as automações da etapa).
 * Destino configurável por instalação (ex.: "Demonstração" para clínicas, "Visita agendada" para imobiliárias).
 */
async function moverParaEtapaQualificado(oportunidadeId: string, versao: number, resumo: string): Promise<string | null> {
  const [cfg] = await db.select().from(configuracao).where(eq(configuracao.chave, "etapa_qualificado"));
  const nome = typeof cfg?.valor === "string" && cfg.valor.trim() ? cfg.valor.trim() : "Demonstração";
  const [para] = await db.select().from(etapaPipeline).where(and(ilike(etapaPipeline.nome, nome), eq(etapaPipeline.ativa, true), eq(etapaPipeline.tipo, "aberta"))).limit(1);
  if (!para) return null;
  return db.transaction(async (tx) => {
    const [o] = await tx.update(oportunidade)
      .set({ etapaId: para.id, situacao: para.tipo, versao: sql`${oportunidade.versao} + 1`, atualizadoEm: new Date() })
      .where(and(eq(oportunidade.id, oportunidadeId), eq(oportunidade.versao, versao), eq(oportunidade.situacao, "aberta")))
      .returning();
    if (!o) return null;
    await tx.insert(interacao).values({ tipo: "alteracao", descricao: `Etapa → "${para.nome}" pela IA (SDR). ${resumo}`.slice(0, 2000), oportunidadeId: o.id, empresaId: o.empresaId, contatoId: o.contatoId });
    await emitirEvento("oportunidade.etapa_alterada", { oportunidadeId: o.id, paraEtapaId: para.id }, undefined, tx);
    return para.nome;
  });
}
