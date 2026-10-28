import { and, asc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { agendamento, campanha, campanhaDestinatario, contato, conversa, mensagem, retomada } from "../db/schema.js";
import { hojeNoFuso, inicioDoDia, obterFuso } from "../lib/datas.js";
import { log } from "../lib/log.js";
import { obterRecursosPro, primeiroNome } from "../lib/recursosPro.js";
import type { CanalWhatsApp, ResultadoEnvio } from "./whatsappService.js";

type Origem = "retomada" | "lembrete" | "campanha";
const HORA = 3600_000;

/** Conversa do número (cria se não existir, ligada ao contato com o mesmo telefone). */
async function conversaDoTelefone(telefone: string, nome: string) {
  const [c] = await db.select({ id: contato.id }).from(contato).where(eq(contato.telefone, telefone)).limit(1);
  const [conv] = await db.insert(conversa).values({ canal: "whatsapp", idExterno: telefone, nomeExibicao: nome, contatoId: c?.id })
    .onConflictDoUpdate({ target: [conversa.canal, conversa.idExterno], set: { contatoId: sql`coalesce(${conversa.contatoId}, ${c?.id ?? null})` } })
    .returning({ id: conversa.id, situacao: conversa.situacao });
  return conv;
}

/** Registra a mensagem que saiu (aparece no Inbox) com o resultado do envio. */
async function registrarSaida(conversaId: string, texto: string, origem: Origem, r: ResultadoEnvio) {
  await db.insert(mensagem).values({
    conversaId, autor: "ia", texto, origem, processadaEm: new Date(),
    ...(r.enviado ? { enviadaEm: new Date(), idExterno: r.idExterno } : { erroEnvio: r.motivo }),
  });
  await db.update(conversa).set({ ultimaMensagemEm: new Date() }).where(eq(conversa.id, conversaId));
}

const descadastrado = async (telefone: string) =>
  (await db.select({ id: contato.id }).from(contato).where(and(eq(contato.telefone, telefone), eq(contato.descadastrado, true))).limit(1)).length > 0;

// ───────────── Retomada de quem parou de responder ─────────────

/**
 * Conversas em que a última mensagem foi uma resposta nossa e o cliente sumiu.
 * Passo 1 (texto livre) só dentro da janela de 24h desde a última mensagem do cliente; passo 2 exige modelo aprovado.
 * Para quando: o cliente responde (novo ciclo), pede para parar, vai para humano, já tem consulta marcada ou a oportunidade fechou.
 */
export async function executarRetomadas(canal: CanalWhatsApp, agora = new Date()) {
  const cfg = await obterRecursosPro();
  if (!cfg.retomada.ativo) return { enviadas: 0 };
  const candidatas = await db.execute<{ conversa_id: string; telefone: string; nome: string; ref_id: string; ref_em: Date; ultima_cliente_em: Date | null }>(sql`
    select c.id as conversa_id, c.id_externo as telefone, coalesce(ct.nome, c.nome_exibicao, '') as nome,
           ult.id as ref_id, ult.criado_em as ref_em,
           (select max(m2.criado_em) from mensagem m2 where m2.conversa_id = c.id and m2.autor = 'cliente') as ultima_cliente_em
    from conversa c
    left join contato ct on ct.id = c.contato_id
    join lateral (
      select m.id, m.autor, m.criado_em from mensagem m
      where m.conversa_id = c.id and m.origem = 'atendimento'
      order by m.criado_em desc limit 1
    ) ult on ult.autor = 'ia'
    where c.situacao = 'ia'
      and coalesce(ct.descadastrado, false) = false
      and ult.criado_em <= ${new Date(agora.getTime() - cfg.retomada.horasPasso1 * HORA)}
      -- já respondeu depois da nossa última mensagem (inclusive a uma retomada)? então não é silêncio
      and not exists (select 1 from mensagem mc where mc.conversa_id = c.id and mc.autor = 'cliente' and mc.criado_em > ult.criado_em)
      and not exists (select 1 from agendamento a where a.telefone = c.id_externo and a.inicio > ${agora} and a.situacao in ('agendado','confirmado'))
      -- negócio já fechado (ganho ou perdido) e nenhum aberto: não insiste
      and (c.contato_id is null
           or not exists (select 1 from oportunidade o where o.contato_id = c.contato_id and o.arquivado_em is null)
           or exists (select 1 from oportunidade o where o.contato_id = c.contato_id and o.arquivado_em is null and o.situacao = 'aberta'))
    limit 50`);
  let enviadas = 0;
  for (const c of candidatas.rows) {
    const desde = agora.getTime() - new Date(c.ref_em).getTime();
    const naJanela = c.ultima_cliente_em !== null && agora.getTime() - new Date(c.ultima_cliente_em).getTime() < 24 * HORA;
    const passo = desde >= cfg.retomada.horasPasso2 * HORA ? 2 : naJanela ? 1 : null;
    if (!passo) continue;
    if (passo === 2 && !cfg.retomada.modeloPasso2) continue;
    // Reserva o passo antes de enviar: dois processos nunca mandam a mesma retomada
    const reservado = await db.insert(retomada).values({ conversaId: c.conversa_id, mensagemRefId: c.ref_id, passo, situacao: "enviada" })
      .onConflictDoNothing().returning({ id: retomada.id });
    if (!reservado.length) continue;
    const nome = primeiroNome(c.nome || "tudo bem");
    const texto = passo === 1 ? cfg.retomada.textoPasso1.replaceAll("{nome}", nome) : `[modelo ${cfg.retomada.modeloPasso2}] ${nome}`;
    const r = passo === 1 ? await canal.enviarTexto(c.telefone, texto) : await canal.enviarModelo(c.telefone, cfg.retomada.modeloPasso2, cfg.idiomaModelos, [nome]);
    await registrarSaida(c.conversa_id, texto, "retomada", r);
    if (!r.enviado) await db.update(retomada).set({ situacao: "falhou", erro: r.motivo }).where(eq(retomada.id, reservado[0].id));
    else enviadas++;
  }
  return { enviadas };
}

// ───────────── Confirmação de consultas (véspera) ─────────────

const formatoData = (d: Date, fuso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit" }).format(d);
const formatoHora = (d: Date, fuso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit" }).format(d);
const horaLocal = (d: Date, fuso: string) => Number(new Intl.DateTimeFormat("en-US", { timeZone: fuso, hour: "2-digit", hourCycle: "h23" }).format(d));

/** Na véspera, a partir da hora configurada, envia a confirmação de cada consulta de amanhã (uma vez só). */
export async function enviarLembretes(canal: CanalWhatsApp, agora = new Date()) {
  const cfg = await obterRecursosPro();
  const fuso = await obterFuso();
  // Consultas que passaram sem resposta ao lembrete
  await db.update(agendamento).set({ situacao: "sem_resposta", atualizadoEm: new Date() })
    .where(and(eq(agendamento.situacao, "agendado"), lt(agendamento.inicio, agora), sql`${agendamento.lembreteEnviadoEm} is not null`));
  if (!cfg.confirmacao.ativo || !cfg.confirmacao.modelo || horaLocal(agora, fuso) < cfg.confirmacao.horaEnvio) return { enviados: 0 };
  const hoje = hojeNoFuso(fuso, agora);
  const [a, m, d] = hoje.split("-").map(Number);
  const amanha = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
  const depois = new Date(Date.UTC(a, m - 1, d + 2)).toISOString().slice(0, 10);
  const lista = await db.select().from(agendamento)
    .where(and(eq(agendamento.situacao, "agendado"), isNull(agendamento.lembreteEnviadoEm), gte(agendamento.inicio, inicioDoDia(amanha, fuso)), lt(agendamento.inicio, inicioDoDia(depois, fuso))))
    .orderBy(asc(agendamento.inicio)).limit(200);
  let enviados = 0;
  for (const ag of lista) {
    // Reserva antes de enviar (idempotência entre processos)
    const [res] = await db.update(agendamento).set({ lembreteEnviadoEm: new Date() }).where(and(eq(agendamento.id, ag.id), isNull(agendamento.lembreteEnviadoEm))).returning({ id: agendamento.id });
    if (!res) continue;
    if (await descadastrado(ag.telefone)) { await db.update(agendamento).set({ erroLembrete: "contato pediu para não receber mensagens" }).where(eq(agendamento.id, ag.id)); continue; }
    const params = [primeiroNome(ag.nome), formatoData(ag.inicio, fuso), formatoHora(ag.inicio, fuso), ag.procedimento ?? "sua consulta"];
    const r = await canal.enviarModelo(ag.telefone, cfg.confirmacao.modelo, cfg.idiomaModelos, params);
    const conv = await conversaDoTelefone(ag.telefone, ag.nome);
    await registrarSaida(conv.id, `Confirmação: ${params[0]}, ${params[3]} em ${params[1]} às ${params[2]}. Pode confirmar?`, "lembrete", r);
    if (r.enviado) enviados++;
    else await db.update(agendamento).set({ erroLembrete: r.motivo }).where(eq(agendamento.id, ag.id));
  }
  return { enviados };
}

// ───────────── Campanhas de reativação (só depois de aprovadas) ─────────────

export async function executarCampanhas(canal: CanalWhatsApp) {
  const cfg = await obterRecursosPro();
  if (!cfg.reativacao.modelo) return { enviados: 0 };
  const ativas = await db.select().from(campanha).where(inArray(campanha.situacao, ["aprovada", "enviando"]));
  let enviados = 0;
  for (const c of ativas) {
    if (c.situacao === "aprovada") await db.update(campanha).set({ situacao: "enviando", atualizadoEm: new Date() }).where(eq(campanha.id, c.id));
    const lote = await db.select().from(campanhaDestinatario).where(and(eq(campanhaDestinatario.campanhaId, c.id), eq(campanhaDestinatario.situacao, "pendente"))).limit(c.limitePorCiclo);
    if (!lote.length) { await db.update(campanha).set({ situacao: "concluida", atualizadoEm: new Date() }).where(eq(campanha.id, c.id)); continue; }
    for (const d of lote) {
      const [res] = await db.update(campanhaDestinatario).set({ situacao: "enviado", enviadoEm: new Date() })
        .where(and(eq(campanhaDestinatario.id, d.id), eq(campanhaDestinatario.situacao, "pendente"))).returning({ id: campanhaDestinatario.id });
      if (!res) continue;
      if (await descadastrado(d.telefone)) { await db.update(campanhaDestinatario).set({ situacao: "pulado", motivo: "pediu para não receber mensagens", enviadoEm: null }).where(eq(campanhaDestinatario.id, d.id)); continue; }
      const r = await canal.enviarModelo(d.telefone, c.modelo, cfg.idiomaModelos, [primeiroNome(d.nome)]);
      const conv = await conversaDoTelefone(d.telefone, d.nome);
      await registrarSaida(conv.id, `[campanha ${c.nome}] ${primeiroNome(d.nome)}`, "campanha", r);
      if (r.enviado) enviados++;
      else await db.update(campanhaDestinatario).set({ situacao: "falhou", motivo: r.motivo }).where(eq(campanhaDestinatario.id, d.id));
    }
  }
  return { enviados };
}

/** Rotinas do Pro, chamadas pelo ciclo periódico (VPS a cada 30 s; cron no serverless). */
export async function executarRotinasPro(canal: CanalWhatsApp, agora = new Date()) {
  const r = { retomadas: 0, lembretes: 0, campanha: 0 };
  try { r.retomadas = (await executarRetomadas(canal, agora)).enviadas; } catch (e) { log("erro", "pro.retomada", { erro: String(e).slice(0, 200) }); }
  try { r.lembretes = (await enviarLembretes(canal, agora)).enviados; } catch (e) { log("erro", "pro.lembretes", { erro: String(e).slice(0, 200) }); }
  try { r.campanha = (await executarCampanhas(canal)).enviados; } catch (e) { log("erro", "pro.campanhas", { erro: String(e).slice(0, 200) }); }
  return r;
}
