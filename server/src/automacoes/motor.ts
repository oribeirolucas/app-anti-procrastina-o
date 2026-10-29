import { and, asc, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { db, type Db } from "../db/index.js";
import {
  automacao,
  contato,
  contrato,
  empresa,
  evento,
  execucaoAutomacao,
  inscricaoFollowup,
  interacao,
  notificacao,
  oportunidade,
  sequenciaFollowup,
  tarefa,
  usuario,
} from "../db/schema.js";
import { hojeNoFuso, obterFuso } from "../lib/datas.js";
import { emitirEvento } from "../lib/eventos.js";
import { log } from "../lib/log.js";
import { paraCentavos } from "../lib/dinheiro.js";
import { acoesSchema, condicoesSchema, MAX_TENTATIVAS, passosSchema, type Acao, type Condicoes } from "./tipos.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Evento = typeof evento.$inferSelect;
const DIA = 86_400_000;

// ───────────── Contexto do evento ─────────────

type Contexto = {
  oportunidade?: typeof oportunidade.$inferSelect;
  contratoRow?: typeof contrato.$inferSelect;
  empresaId?: string | null;
  contatoId?: string | null;
  responsavelId?: string | null;
  nomes: { empresa?: string; oportunidade?: string; contato?: string };
};

async function montarContexto(ev: Evento, x: Tx | Db = db): Promise<Contexto> {
  const p = ev.payload as Record<string, string | undefined>;
  const ctx: Contexto = { nomes: {} };
  if (p.oportunidadeId) {
    const [o] = await x.select().from(oportunidade).where(eq(oportunidade.id, p.oportunidadeId));
    if (o) {
      ctx.oportunidade = o;
      ctx.empresaId = o.empresaId;
      ctx.contatoId = o.contatoId;
      ctx.responsavelId = o.responsavelId;
      ctx.nomes.oportunidade = o.titulo;
    }
  }
  if (p.contratoId) {
    const [c] = await x.select().from(contrato).where(eq(contrato.id, p.contratoId));
    if (c) { ctx.contratoRow = c; ctx.empresaId ??= c.empresaId; }
  }
  ctx.empresaId ??= p.empresaId ?? null;
  ctx.contatoId ??= p.contatoId ?? null;
  if (ctx.empresaId) {
    const [e] = await x.select({ nome: empresa.nome, responsavelId: empresa.responsavelId }).from(empresa).where(eq(empresa.id, ctx.empresaId));
    ctx.nomes.empresa = e?.nome;
    ctx.responsavelId ??= e?.responsavelId ?? null;
  }
  if (ctx.contatoId) {
    const [c] = await x.select({ nome: contato.nome }).from(contato).where(eq(contato.id, ctx.contatoId));
    ctx.nomes.contato = c?.nome;
  }
  return ctx;
}

export function condicoesAtendidas(cond: Condicoes, ev: Evento, ctx: Contexto): { ok: boolean; motivo?: string } {
  const p = ev.payload as Record<string, unknown>;
  const o = ctx.oportunidade;
  if (cond.etapaId && o?.etapaId !== cond.etapaId) return { ok: false, motivo: "etapa diferente" };
  if (cond.situacao && o?.situacao !== cond.situacao) return { ok: false, motivo: "situação diferente" };
  if (cond.origem && (o?.origem ?? "").toLowerCase() !== cond.origem.toLowerCase()) return { ok: false, motivo: "origem diferente" };
  if (cond.valorMinimo !== undefined && paraCentavos(o?.valor ?? "0") < Math.round(cond.valorMinimo * 100)) return { ok: false, motivo: "valor abaixo do mínimo" };
  if (cond.origemCaptacaoId && p.origemCaptacaoId !== cond.origemCaptacaoId) return { ok: false, motivo: "outra origem de captação" };
  if (ev.tipo === "contrato.vencendo" && cond.diasAntes !== p.diasAntes) return { ok: false, motivo: "outro prazo de vencimento" };
  return { ok: true };
}

const preencher = (t: string, ctx: Contexto) =>
  t.replace(/\{(empresa|oportunidade|contato)\}/g, (_, k: keyof Contexto["nomes"]) => ctx.nomes[k] ?? "—");

async function destinatarios(x: Tx, destino: "responsavel_registro" | "gestores" | "usuario", ctx: Contexto, usuarioId?: string) {
  if (destino === "usuario" && usuarioId) return [usuarioId];
  if (destino === "responsavel_registro" && ctx.responsavelId) return [ctx.responsavelId];
  // Sem responsável definido, cai para gestores/admins (ninguém fica sem aviso)
  const g = await x.select({ id: usuario.id }).from(usuario).where(and(eq(usuario.ativo, true), inArray(usuario.perfil, ["admin", "gestor"])));
  return g.map((u) => u.id);
}

// ───────────── Ações ─────────────

async function executarAcao(x: Tx, a: Acao, ev: Evento, ctx: Contexto, automacaoId: string, nomeAutomacao: string) {
  const link = ctx.oportunidade ? `/oportunidades/${ctx.oportunidade.id}` : ctx.empresaId ? `/empresas/${ctx.empresaId}` : null;
  if (a.tipo === "criar_tarefa") {
    const resp = a.responsavel === "usuario" ? a.usuarioId! : (ctx.responsavelId ?? (await destinatarios(x, "gestores", ctx))[0] ?? null);
    const [t] = await x
      .insert(tarefa)
      .values({
        titulo: preencher(a.titulo, ctx),
        descricao: `Criada pela automação "${nomeAutomacao}".`,
        venceEm: new Date(Date.now() + a.prazoDias * DIA),
        responsavelId: resp,
        empresaId: ctx.empresaId ?? null,
        contatoId: ctx.contatoId ?? null,
        oportunidadeId: ctx.oportunidade?.id ?? null,
        origem: "automacao",
      })
      .returning({ id: tarefa.id });
    return { tipo: a.tipo, tarefaId: t.id };
  }
  if (a.tipo === "notificar") {
    const ids = await destinatarios(x, a.destino, ctx, a.usuarioId);
    if (ids.length)
      await x
        .insert(notificacao)
        .values(ids.map((usuarioId) => ({ usuarioId, titulo: preencher(a.titulo, ctx), mensagem: `Automação "${nomeAutomacao}"`, link, chave: `aut:${automacaoId}:${ev.id}` })))
        .onConflictDoNothing();
    return { tipo: a.tipo, destinatarios: ids.length };
  }
  // iniciar_followup
  if (!ctx.oportunidade) return { tipo: a.tipo, ignorado: "evento sem oportunidade" };
  if (ctx.oportunidade.situacao !== "aberta" || ctx.oportunidade.arquivadoEm) return { tipo: a.tipo, ignorado: "oportunidade encerrada" };
  const [seq] = await x.select().from(sequenciaFollowup).where(eq(sequenciaFollowup.id, a.sequenciaId));
  if (!seq || !seq.ativa) return { tipo: a.tipo, ignorado: "sequência inexistente ou pausada" };
  if (ctx.contatoId) {
    const [c] = await x.select({ d: contato.descadastrado }).from(contato).where(eq(contato.id, ctx.contatoId));
    if (c?.d) return { tipo: a.tipo, ignorado: "contato descadastrado" };
  }
  const passos = passosSchema.parse(seq.passos);
  const r = await x
    .insert(inscricaoFollowup)
    .values({ sequenciaId: seq.id, oportunidadeId: ctx.oportunidade.id, contatoId: ctx.contatoId ?? null, proximoEm: new Date(Date.now() + passos[0].aposDias * DIA) })
    .onConflictDoNothing()
    .returning({ id: inscricaoFollowup.id });
  if (r.length)
    await x.insert(interacao).values({ tipo: "automacao", descricao: `Follow-up "${seq.nome}" iniciado (${passos.length} passos).`, oportunidadeId: ctx.oportunidade.id, empresaId: ctx.empresaId, contatoId: ctx.contatoId });
  return { tipo: a.tipo, inscricaoId: r[0]?.id ?? null, jaInscrito: r.length === 0 };
}

// ───────────── Regras de sistema: parada de follow-up ─────────────

async function interromperFollowups(x: Tx | Db, filtro: { contatoId?: string | null; oportunidadeId?: string | null }, motivo: string) {
  const alvo = [
    filtro.contatoId ? eq(inscricaoFollowup.contatoId, filtro.contatoId) : undefined,
    filtro.oportunidadeId ? eq(inscricaoFollowup.oportunidadeId, filtro.oportunidadeId) : undefined,
  ].filter(Boolean);
  if (!alvo.length) return 0;
  const r = await x
    .update(inscricaoFollowup)
    .set({ situacao: "interrompida", motivoParada: motivo, encerradaEm: new Date(), proximoEm: null })
    .where(and(eq(inscricaoFollowup.situacao, "ativa"), or(...alvo)))
    .returning({ id: inscricaoFollowup.id, oportunidadeId: inscricaoFollowup.oportunidadeId });
  for (const i of r)
    await x.insert(interacao).values({ tipo: "automacao", descricao: `Follow-up interrompido: ${motivo}.`, oportunidadeId: i.oportunidadeId });
  return r.length;
}

async function aplicarRegrasDeSistema(ev: Evento) {
  const p = ev.payload as Record<string, string | undefined>;
  if (ev.tipo === "interacao.resposta_contato") await interromperFollowups(db, { contatoId: p.contatoId, oportunidadeId: p.oportunidadeId }, "contato respondeu");
  if (ev.tipo === "contato.descadastrado") await interromperFollowups(db, { contatoId: p.contatoId }, "contato descadastrado");
  if (ev.tipo === "oportunidade.encerrada") await interromperFollowups(db, { oportunidadeId: p.oportunidadeId }, "oportunidade encerrada");
}

// ───────────── Processamento de um evento ─────────────

async function registrarExecucao(automacaoId: string, eventoId: string, situacao: "ignorada" | "erro", dados: { detalhes?: unknown; erro?: string }) {
  await db
    .insert(execucaoAutomacao)
    .values({ automacaoId, eventoId, situacao, detalhes: dados.detalhes ?? null, erro: dados.erro ?? null })
    .onConflictDoUpdate({
      target: [execucaoAutomacao.automacaoId, execucaoAutomacao.eventoId],
      set: { situacao, erro: dados.erro ?? null, detalhes: dados.detalhes ?? null, tentativas: sql`${execucaoAutomacao.tentativas} + 1`, atualizadoEm: new Date() },
      // Nunca rebaixa uma execução que já teve sucesso
      setWhere: sql`${execucaoAutomacao.situacao} <> 'sucesso'`,
    });
}

export async function processarEvento(ev: Evento): Promise<{ erros: string[] }> {
  await aplicarRegrasDeSistema(ev);
  const regras = await db
    .select()
    .from(automacao)
    .where(and(eq(automacao.gatilho, ev.tipo), eq(automacao.ativa, true), lte(automacao.criadoEm, ev.criadoEm)));
  const erros: string[] = [];
  for (const r of regras) {
    const [ja] = await db.select({ s: execucaoAutomacao.situacao }).from(execucaoAutomacao).where(and(eq(execucaoAutomacao.automacaoId, r.id), eq(execucaoAutomacao.eventoId, ev.id)));
    if (ja && ja.s !== "erro") continue; // já executada (ou ignorada): idempotência
    try {
      const cond = condicoesSchema.parse(r.condicoes ?? {});
      const acoes = acoesSchema.parse(r.acoes);
      const ctx = await montarContexto(ev);
      const av = condicoesAtendidas(cond, ev, ctx);
      if (!av.ok) { await registrarExecucao(r.id, ev.id, "ignorada", { detalhes: { motivo: av.motivo } }); continue; }
      await db.transaction(async (tx) => {
        // A linha de execução é gravada primeiro, na mesma transação das ações:
        // se outra instância já executou, o conflito aborta sem repetir efeitos.
        const marcada = await tx
          .insert(execucaoAutomacao)
          .values({ automacaoId: r.id, eventoId: ev.id, situacao: "sucesso" })
          .onConflictDoUpdate({
            target: [execucaoAutomacao.automacaoId, execucaoAutomacao.eventoId],
            set: { situacao: "sucesso", erro: null, tentativas: sql`${execucaoAutomacao.tentativas} + 1`, atualizadoEm: new Date() },
            setWhere: sql`${execucaoAutomacao.situacao} = 'erro'`,
          })
          .returning({ id: execucaoAutomacao.id });
        if (!marcada.length) return;
        const resultados = [];
        for (const a of acoes) resultados.push(await executarAcao(tx, a, ev, await montarContexto(ev, tx), r.id, r.nome));
        await tx.update(execucaoAutomacao).set({ detalhes: resultados }).where(eq(execucaoAutomacao.id, marcada[0].id));
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      erros.push(`${r.nome}: ${msg}`);
      await registrarExecucao(r.id, ev.id, "erro", { erro: msg.slice(0, 1000) });
    }
  }
  return { erros };
}

// ───────────── Fila ─────────────

/** Processa eventos pendentes. Cada evento é "reservado" por 2 min para que instâncias concorrentes não o peguem. */
export async function processarEventos(limite = 50) {
  const reservados = await db.execute<Evento & { payload: unknown }>(sql`
    update ${evento} set proxima_tentativa_em = now() + interval '120 seconds'
    where id in (
      select id from ${evento}
      where situacao = 'pendente' and (proxima_tentativa_em is null or proxima_tentativa_em <= now())
      order by criado_em limit ${limite} for update skip locked
    )
    returning id`);
  const ids = reservados.rows.map((r) => (r as { id: string }).id);
  if (!ids.length) return { processados: 0, comErro: 0, falharam: 0 };
  const evs = await db.select().from(evento).where(inArray(evento.id, ids)).orderBy(asc(evento.criadoEm));
  let comErro = 0, falharam = 0;
  for (const ev of evs) {
    let erros: string[];
    try { erros = (await processarEvento(ev)).erros; }
    catch (e) { erros = [e instanceof Error ? e.message : String(e)]; }
    if (!erros.length) {
      await db.update(evento).set({ situacao: "processado", processadoEm: new Date(), ultimoErro: null, proximaTentativaEm: null }).where(eq(evento.id, ev.id));
      continue;
    }
    comErro++;
    const tentativas = ev.tentativas + 1;
    const esgotou = tentativas >= MAX_TENTATIVAS;
    if (esgotou) falharam++;
    // Espera crescente: 1, 4, 9, 16 min… Depois de MAX_TENTATIVAS, exige intervenção (reprocessar manualmente).
    await db
      .update(evento)
      .set({ tentativas, ultimoErro: erros.join(" | ").slice(0, 2000), situacao: esgotou ? "falhou" : "pendente", proximaTentativaEm: esgotou ? null : new Date(Date.now() + tentativas * tentativas * 60_000) })
      .where(eq(evento.id, ev.id));
    log(esgotou ? "erro" : "aviso", esgotou ? "automacao.evento_falhou" : "automacao.evento_erro", { eventoId: ev.id, tipo: ev.tipo, tentativas });
  }
  return { processados: evs.length, comErro, falharam };
}

// ───────────── Agendados ─────────────

/** Emite contrato.vencendo para as automações que pedem aviso N dias antes. Idempotente por chave. */
async function agendarVencimentos() {
  const regras = await db.select({ condicoes: automacao.condicoes }).from(automacao).where(and(eq(automacao.gatilho, "contrato.vencendo"), eq(automacao.ativa, true)));
  const prazos = [...new Set(regras.map((r) => condicoesSchema.safeParse(r.condicoes).data?.diasAntes).filter((d): d is number => d !== undefined))];
  if (!prazos.length) return 0;
  const hoje = hojeNoFuso(await obterFuso());
  let n = 0;
  for (const d of prazos) {
    const alvo = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8) + d)).toISOString().slice(0, 10);
    const cs = await db.select({ id: contrato.id, empresaId: contrato.empresaId, fim: contrato.fim }).from(contrato).where(and(eq(contrato.situacao, "ativo"), eq(contrato.fim, alvo)));
    for (const c of cs) if (await emitirEvento("contrato.vencendo", { contratoId: c.id, empresaId: c.empresaId, diasAntes: d, fim: c.fim }, `contrato.vencendo:${c.id}:${c.fim}:${d}`)) n++;
  }
  return n;
}

/** Executa os passos de follow-up vencidos. Reconfere as condições de parada antes de cada passo. */
async function executarFollowups(limite = 100) {
  const devidos = await db
    .select({ id: inscricaoFollowup.id })
    .from(inscricaoFollowup)
    .where(and(eq(inscricaoFollowup.situacao, "ativa"), lte(inscricaoFollowup.proximoEm, new Date())))
    .limit(limite);
  let executados = 0, interrompidos = 0;
  for (const { id } of devidos) {
    await db.transaction(async (tx) => {
      const [i] = await tx.select().from(inscricaoFollowup).where(and(eq(inscricaoFollowup.id, id), eq(inscricaoFollowup.situacao, "ativa"), lte(inscricaoFollowup.proximoEm, new Date()))).for("update", { skipLocked: true });
      if (!i) return; // outra instância já tratou
      const [o] = await tx.select().from(oportunidade).where(eq(oportunidade.id, i.oportunidadeId));
      const [c] = i.contatoId ? await tx.select().from(contato).where(eq(contato.id, i.contatoId)) : [];
      const [resp] = await tx
        .select({ id: interacao.id })
        .from(interacao)
        .where(and(eq(interacao.respostaDoContato, true), gt(interacao.criadoEm, i.iniciadaEm), or(eq(interacao.oportunidadeId, i.oportunidadeId), i.contatoId ? eq(interacao.contatoId, i.contatoId) : undefined)))
        .limit(1);
      const [seq] = await tx.select().from(sequenciaFollowup).where(eq(sequenciaFollowup.id, i.sequenciaId));
      const motivo = !o || o.situacao !== "aberta" || o.arquivadoEm ? "oportunidade encerrada"
        : c?.descadastrado ? "contato descadastrado"
        : resp ? "contato respondeu"
        : !seq?.ativa ? "sequência pausada" : null;
      if (motivo) {
        await interromperFollowups(tx, { oportunidadeId: i.oportunidadeId }, motivo);
        interrompidos++;
        return;
      }
      const passos = passosSchema.parse(seq!.passos);
      const passo = passos[i.passoAtual];
      await tx.insert(tarefa).values({
        titulo: passo.titulo.replace(/\{(empresa|oportunidade|contato)\}/g, (_, k) => (k === "oportunidade" ? o!.titulo : k === "contato" ? (c?.nome ?? "—") : "—")),
        descricao: `Follow-up "${seq!.nome}", passo ${i.passoAtual + 1} de ${passos.length}.`,
        venceEm: new Date(),
        responsavelId: o!.responsavelId,
        empresaId: o!.empresaId,
        contatoId: i.contatoId,
        oportunidadeId: o!.id,
        origem: "follow_up",
      });
      const ultimo = i.passoAtual + 1 >= passos.length;
      await tx
        .update(inscricaoFollowup)
        .set(ultimo
          ? { passoAtual: i.passoAtual + 1, situacao: "concluida", encerradaEm: new Date(), proximoEm: null }
          : { passoAtual: i.passoAtual + 1, proximoEm: new Date(Date.now() + passos[i.passoAtual + 1].aposDias * DIA) })
        .where(eq(inscricaoFollowup.id, i.id));
      await tx.insert(interacao).values({ tipo: "automacao", descricao: `Follow-up "${seq!.nome}": passo ${i.passoAtual + 1}/${passos.length} — tarefa "${passo.titulo}" criada.${ultimo ? " Sequência concluída." : ""}`, oportunidadeId: o!.id, empresaId: o!.empresaId, contatoId: i.contatoId });
      executados++;
    });
  }
  return { executados, interrompidos };
}

let emAndamento: Promise<unknown> | null = null;

/** Um ciclo completo. Chamado após mutações, pelo intervalo do servidor (VPS) e pelo botão "Processar agora". */
export async function executarCiclo(opcoes: { limite?: number } = {}) {
  // Evita ciclos sobrepostos na mesma instância (as reservas no banco cobrem instâncias diferentes)
  if (emAndamento) return { ignorado: "ciclo em andamento" } as const;
  const p = (async () => {
    const vencimentos = await agendarVencimentos();
    const followups = await executarFollowups();
    const eventos = await processarEventos(opcoes.limite ?? 50);
    return { vencimentos, followups, eventos };
  })();
  emAndamento = p;
  try { return await p; } finally { emAndamento = null; }
}

export { interromperFollowups };
// Usado por testes para simular a passagem do tempo
export const _interno = { executarFollowups, agendarVencimentos };
