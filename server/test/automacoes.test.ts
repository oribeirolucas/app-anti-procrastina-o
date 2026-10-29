import type { AddressInfo } from "node:net";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarServidor } from "../src/app.js";
import { _interno, executarCiclo } from "../src/automacoes/motor.js";
import { db } from "../src/db/index.js";
import { automacao, contrato, evento, execucaoAutomacao, inscricaoFollowup, notificacao, tarefa } from "../src/db/schema.js";
import { assinar } from "../src/webhooks/captacao.js";
import { chamadorComo, prepararBase } from "./utils.js";

const codigo = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; }
};
const tarefasDa = (oportunidadeId: string) => db.select().from(tarefa).where(eq(tarefa.oportunidadeId, oportunidadeId));

let base = "";
const servidor = criarServidor();
beforeAll(async () => {
  await prepararBase();
  await new Promise<void>((ok) => servidor.listen(0, ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((ok) => servidor.close(() => ok())));

describe("automações: gatilho → condição → ação", () => {
  it("cria tarefa e notificação uma única vez, respeita condição e pausa", async () => {
    const g = await chamadorComo("gestor");
    const etapas = await g.pipeline.etapas();
    const demo = etapas.find((e) => e.nome === "Demonstração")!;
    const a = await g.automacoes.salvar({
      dados: {
        nome: "Preparar demo",
        gatilho: "oportunidade.etapa_alterada",
        condicoes: { etapaId: demo.id, valorMinimo: 500 },
        acoes: [
          { tipo: "criar_tarefa", titulo: "Preparar demonstração para {empresa}", prazoDias: 1, responsavel: "responsavel_registro" },
          { tipo: "notificar", titulo: "Demo marcada: {oportunidade}", destino: "responsavel_registro" },
        ],
      },
    });
    const e = await g.cadastros.criarEmpresa({ nome: "Clínica Automação", cidade: "Teste" });
    const grande = await g.pipeline.criarOportunidade({ titulo: "Op grande", empresaId: e.id, valor: "597" });
    const pequena = await g.pipeline.criarOportunidade({ titulo: "Op pequena", empresaId: e.id, valor: "100" });
    await g.pipeline.moverEtapa({ id: grande.id, versao: grande.versao, etapaId: demo.id });
    await g.pipeline.moverEtapa({ id: pequena.id, versao: pequena.versao, etapaId: demo.id });

    // Processado inline após a mutação
    const t = await tarefasDa(grande.id);
    expect(t.filter((x) => x.origem === "automacao").map((x) => x.titulo)).toEqual(["Preparar demonstração para Clínica Automação"]);
    expect((await tarefasDa(pequena.id)).filter((x) => x.origem === "automacao")).toHaveLength(0); // valor < mínimo
    const notifs = await g.automacoes.notificacoes();
    expect(notifs.itens.some((n) => n.titulo === "Demo marcada: Op grande")).toBe(true);

    // Reprocessar não duplica: forçamos os eventos de volta a pendente
    await db.update(evento).set({ situacao: "pendente", processadoEm: null, proximaTentativaEm: null }).where(eq(evento.tipo, "oportunidade.etapa_alterada"));
    await executarCiclo({ limite: 500 });
    expect((await tarefasDa(grande.id)).filter((x) => x.origem === "automacao")).toHaveLength(1);
    const execs = await db.select().from(execucaoAutomacao).where(eq(execucaoAutomacao.automacaoId, a.id));
    expect(execs.filter((x) => x.situacao === "sucesso")).toHaveLength(1);
    expect(execs.some((x) => x.situacao === "ignorada")).toBe(true);

    // Pausada: não executa
    await g.automacoes.definirAtiva({ id: a.id, ativa: false });
    const outra = await g.pipeline.criarOportunidade({ titulo: "Op pausada", valor: "900" });
    await g.pipeline.moverEtapa({ id: outra.id, versao: outra.versao, etapaId: demo.id });
    expect((await tarefasDa(outra.id)).filter((x) => x.origem === "automacao")).toHaveLength(0);
  });

  it("operador não gerencia automações; validação de ações", async () => {
    const op = await chamadorComo("operador");
    const g = await chamadorComo("gestor");
    expect(await codigo(op.automacoes.listar())).toBe("FORBIDDEN");
    expect(await codigo(op.automacoes.salvar({ dados: { nome: "x123", gatilho: "empresa.criada", condicoes: {}, acoes: [{ tipo: "notificar", titulo: "oi", destino: "gestores" }] } }))).toBe("FORBIDDEN");
    expect(await codigo(g.automacoes.salvar({ dados: { nome: "Sem ação", gatilho: "empresa.criada", condicoes: {}, acoes: [] } }))).toBe("BAD_REQUEST");
    expect(await codigo(g.automacoes.salvar({ dados: { nome: "Vence", gatilho: "contrato.vencendo", condicoes: {}, acoes: [{ tipo: "notificar", titulo: "oi", destino: "gestores" }] } }))).toBe("BAD_REQUEST");
    const seq = await g.automacoes.salvarSequencia({ nome: "Seq inválida p/ empresa", passos: [{ aosDias: 1, titulo: "x" } as never] }).catch(() => null);
    expect(seq).toBeNull();
  });
});

describe("follow-up", () => {
  async function preparar(nome: string) {
    const g = await chamadorComo("gestor");
    const seq = await g.automacoes.salvarSequencia({ nome: `Retomada ${nome}`, passos: [{ aposDias: 1, titulo: "Toque 1 para {contato}" }, { aposDias: 3, titulo: "Toque 2" }] });
    await g.automacoes.salvar({ dados: { nome: `Inicia follow-up ${nome}`, gatilho: "oportunidade.criada", condicoes: { origem: nome }, acoes: [{ tipo: "iniciar_followup", sequenciaId: seq.id }] } });
    const c = await g.cadastros.criarContato({ nome: `Paciente ${nome}`, email: `${nome}@fu.dev` });
    const o = await g.pipeline.criarOportunidade({ titulo: `FU ${nome}`, contatoId: c.id, origem: nome });
    const [i] = await db.select().from(inscricaoFollowup).where(eq(inscricaoFollowup.oportunidadeId, o.id));
    return { g, seq, c, o, i };
  }
  const vencer = (id: string) => db.update(inscricaoFollowup).set({ proximoEm: new Date(Date.now() - 1000) }).where(eq(inscricaoFollowup.id, id));

  it("executa os passos no tempo certo e conclui", async () => {
    const { o, i } = await preparar("passos");
    expect(i.situacao).toBe("ativa");
    expect(i.proximoEm!.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000); // 1 dia
    await _interno.executarFollowups();
    expect((await tarefasDa(o.id)).filter((t) => t.origem === "follow_up")).toHaveLength(0); // ainda não venceu
    await vencer(i.id);
    await _interno.executarFollowups();
    await _interno.executarFollowups(); // repetir não duplica o passo
    let t = (await tarefasDa(o.id)).filter((x) => x.origem === "follow_up");
    expect(t.map((x) => x.titulo)).toEqual(["Toque 1 para Paciente passos"]);
    await vencer(i.id);
    await _interno.executarFollowups();
    t = (await tarefasDa(o.id)).filter((x) => x.origem === "follow_up");
    expect(t).toHaveLength(2);
    const [fim] = await db.select().from(inscricaoFollowup).where(eq(inscricaoFollowup.id, i.id));
    expect(fim.situacao).toBe("concluida");
  });

  it("para quando o contato responde", async () => {
    const { g, o, i } = await preparar("resposta");
    await g.pipeline.registrarInteracao({ tipo: "whatsapp", descricao: "Respondeu: tenho interesse", oportunidadeId: o.id, respostaDoContato: true });
    const [x] = await db.select().from(inscricaoFollowup).where(eq(inscricaoFollowup.id, i.id));
    expect(x).toMatchObject({ situacao: "interrompida", motivoParada: "contato respondeu" });
  });

  it("para no descadastro, mesmo se o evento ainda não foi processado (rechecagem no passo)", async () => {
    const { g, c, o, i } = await preparar("optout");
    // Simula fila atrasada: descadastro gravado direto, sem processar o evento
    await db.execute(sql`update contato set descadastrado = true where id = ${c.id}`);
    await vencer(i.id);
    await _interno.executarFollowups();
    const [x] = await db.select().from(inscricaoFollowup).where(eq(inscricaoFollowup.id, i.id));
    expect(x).toMatchObject({ situacao: "interrompida", motivoParada: "contato descadastrado" });
    expect((await tarefasDa(o.id)).filter((t) => t.origem === "follow_up")).toHaveLength(0);
    // E não reinicia para contato descadastrado
    const o2 = await g.pipeline.criarOportunidade({ titulo: "FU optout 2", contatoId: c.id, origem: "optout" });
    expect(await db.select().from(inscricaoFollowup).where(eq(inscricaoFollowup.oportunidadeId, o2.id))).toHaveLength(0);
  });

  it("para quando a oportunidade é encerrada", async () => {
    const { g, o, i } = await preparar("encerrada");
    const perdida = (await g.pipeline.etapas()).find((e) => e.tipo === "perdida")!;
    await g.pipeline.moverEtapa({ id: o.id, versao: (await g.pipeline.oportunidade({ id: o.id })).versao, etapaId: perdida.id, motivoPerda: "Sem orçamento" });
    const [x] = await db.select().from(inscricaoFollowup).where(eq(inscricaoFollowup.id, i.id));
    expect(x).toMatchObject({ situacao: "interrompida", motivoParada: "oportunidade encerrada" });
  });
});

describe("falhas e tentativas", () => {
  it("erro em ação gera novas tentativas com espera e, esgotadas, marca o evento como falhou", async () => {
    const g = await chamadorComo("gestor");
    const a = await g.automacoes.salvar({ dados: { nome: "Quebrada", gatilho: "empresa.criada", condicoes: {}, acoes: [{ tipo: "notificar", titulo: "Aviso", destino: "gestores" }] } });
    // Corrompe as ações direto no banco para forçar erro de execução
    await db.update(automacao).set({ acoes: [{ tipo: "acao_inexistente" }] }).where(eq(automacao.id, a.id));
    const e = await g.cadastros.criarEmpresa({ nome: "Empresa Falha", cidade: "Teste" });
    const [ev] = await db.select().from(evento).where(and(eq(evento.tipo, "empresa.criada"), sql`${evento.payload}->>'empresaId' = ${e.id}`));
    expect(ev).toMatchObject({ situacao: "pendente", tentativas: 1 });
    expect(ev.proximaTentativaEm!.getTime()).toBeGreaterThan(Date.now()); // aguarda antes de tentar de novo
    for (let k = 0; k < 6; k++) {
      await db.update(evento).set({ proximaTentativaEm: new Date(Date.now() - 1000) }).where(and(eq(evento.id, ev.id), eq(evento.situacao, "pendente")));
      await executarCiclo({ limite: 500 });
    }
    const [fim] = await db.select().from(evento).where(eq(evento.id, ev.id));
    expect(fim).toMatchObject({ situacao: "falhou", tentativas: 5 });
    expect(fim.ultimoErro).toContain("Quebrada");
    const fila = await g.automacoes.fila();
    expect(fila.falhos.some((f) => f.id === ev.id)).toBe(true);
    // Corrigida a automação, o reprocessamento manual conclui
    await db.update(automacao).set({ acoes: [{ tipo: "notificar", titulo: "ok", destino: "gestores" }] }).where(eq(automacao.id, a.id));
    await g.automacoes.reprocessarEvento({ id: ev.id });
    const [ok] = await db.select().from(evento).where(eq(evento.id, ev.id));
    expect(ok.situacao).toBe("processado");
  });
});

describe("contrato vencendo (agendado)", () => {
  it("avisa N dias antes uma única vez", async () => {
    const g = await chamadorComo("gestor");
    await g.automacoes.salvar({ dados: { nome: "Renovação 30d", gatilho: "contrato.vencendo", condicoes: { diasAntes: 30 }, acoes: [{ tipo: "notificar", titulo: "Renovar contrato de {empresa}", destino: "gestores" }] } });
    const e = await g.cadastros.criarEmpresa({ nome: "Clínica Renova", cidade: "Teste" });
    const fim = new Date(Date.now() + 30 * 86400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    await g.contratos.criar({ empresaId: e.id, plano: "Pro", valorMensal: "597", inicio: "2025-01-01", fim, diaVencimento: 10 });
    await executarCiclo();
    await executarCiclo();
    const n = await db.select().from(notificacao).where(eq(notificacao.titulo, "Renovar contrato de Clínica Renova"));
    const gestores = new Set(n.map((x) => x.usuarioId));
    expect(n.length).toBe(gestores.size); // uma por gestor, sem repetição
    expect(n.length).toBeGreaterThan(0);
    expect((await db.select().from(contrato).where(eq(contrato.empresaId, e.id)))[0].fim).toBe(fim);
  });
});

describe("origens de captação (webhooks)", () => {
  it("HMAC: aceita assinado, recusa inválido, não duplica reenvio e dispara automação de lead", async () => {
    const g = await chamadorComo("gestor");
    const etapa = (await g.pipeline.etapas())[0];
    const { id, segredo } = await g.automacoes.criarOrigem({ nome: "n8n Landing", modo: "hmac", etapaId: etapa.id, origemRotulo: "landing" });
    await g.automacoes.salvar({ dados: { nome: "Lead novo", gatilho: "lead.captado", condicoes: { origemCaptacaoId: id }, acoes: [{ tipo: "criar_tarefa", titulo: "Ligar para {contato} em até 5 min", prazoDias: 0, responsavel: "usuario", usuarioId: (await g.auth.eu())!.id }] } });
    const corpo = JSON.stringify({ nome: "Maria Lead", email: "maria.lead@exemplo.dev", telefone: "11 90000-0000", mensagem: "Quero preço" });
    const enviar = (assinatura: string, idEvento = "evt-1") =>
      fetch(`${base}/webhooks/captacao/${id}`, { method: "POST", headers: { "content-type": "application/json", "x-assinatura": assinatura, "x-id-evento": idEvento }, body: corpo });

    expect((await enviar("sha256=errada")).status).toBe(401);
    const r1 = await enviar(assinar(segredo!, corpo));
    expect(r1.status).toBe(201);
    const { oportunidadeId } = (await r1.json()) as { oportunidadeId: string };
    const r2 = await enviar(assinar(segredo!, corpo));
    expect(r2.status).toBe(200);
    expect(await r2.json()).toEqual({ duplicado: true });
    expect((await g.cadastros.contatos({ busca: "maria.lead" })).total).toBe(1);
    expect((await tarefasDa(oportunidadeId)).map((t) => t.titulo)).toEqual(["Ligar para Maria Lead em até 5 min"]);
    const o = await g.pipeline.oportunidade({ id: oportunidadeId });
    expect(o.origem).toBe("landing");
    expect(o.interacoes.some((i) => i.descricao.includes("Quero preço"))).toBe(true);

    // Dados inválidos → 422 com campos; segredo rotacionado invalida o antigo
    const ruim = JSON.stringify({ nome: "X" });
    expect((await fetch(`${base}/webhooks/captacao/${id}`, { method: "POST", headers: { "x-assinatura": assinar(segredo!, ruim) }, body: ruim })).status).toBe(422);
    const { segredo: novo } = await g.automacoes.rotacionarSegredo({ id });
    expect((await enviar(assinar(segredo!, corpo), "evt-2")).status).toBe(401);
    expect((await enviar(assinar(novo, corpo), "evt-2")).status).toBe(201);
    // Revogada → 404
    await g.automacoes.definirOrigemAtiva({ id, ativa: false });
    expect((await enviar(assinar(novo, corpo), "evt-3")).status).toBe(404);
  });

  it("formulário público: CORS do domínio, armadilha anti-robô, duplicado no dia e limite por IP", async () => {
    const g = await chamadorComo("gestor");
    const etapa = (await g.pipeline.etapas())[0];
    const { id } = await g.automacoes.criarOrigem({ nome: "Site", modo: "publico", etapaId: etapa.id, dominioPermitido: "https://clinica.exemplo/" });
    const post = (dados: Record<string, string>, origin = "https://clinica.exemplo") =>
      fetch(`${base}/webhooks/formulario/${id}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin }, body: new URLSearchParams(dados).toString() });

    const pre = await fetch(`${base}/webhooks/formulario/${id}`, { method: "OPTIONS", headers: { origin: "https://clinica.exemplo" } });
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://clinica.exemplo");
    expect((await post({ nome: "Ana Site", email: "ana@site.dev" }, "https://outro.exemplo")).status).toBe(403);
    expect((await post({ nome: "Robô", email: "robo@x.dev", website: "http://spam" })).status).toBe(200);
    expect((await g.cadastros.contatos({ busca: "robo@x.dev" })).total).toBe(0);
    expect((await post({ nome: "Ana Site", email: "ana@site.dev" })).status).toBe(201);
    expect((await post({ nome: "Ana Site", email: "ana@site.dev" })).status).toBe(201); // resposta igual, sem duplicar
    expect((await g.pipeline.oportunidades({ busca: "Ana Site" })).length).toBe(1);
    // 5 envios por IP a cada 10 min (o 403 de domínio errado não conta; robô e os 2 da Ana contam)
    expect((await post({ nome: "Bia", email: "bia@site.dev" })).status).toBe(201);
    expect((await post({ nome: "Caio", email: "caio@site.dev" })).status).toBe(201);
    expect((await post({ nome: "Davi", email: "davi@site.dev" })).status).toBe(429);
  });
});
