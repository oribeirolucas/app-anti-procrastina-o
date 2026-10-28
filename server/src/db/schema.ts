import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  integer,
  numeric,
  boolean,
  jsonb,
  text,
  timestamp,
  date,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Valores monetários: numeric(14,2) no banco, string no TypeScript.
// Cálculos são feitos em centavos (inteiros) — ver src/lib/dinheiro.ts.
const dinheiro = (nome: string) => numeric(nome, { precision: 14, scale: 2 });
const criadoEm = () => timestamp("criado_em", { withTimezone: true }).notNull().defaultNow();
const atualizadoEm = () => timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow();
// Controle de concorrência otimista: toda edição envia a versão lida; se mudou, a gravação é recusada.
const versao = () => integer("versao").notNull().default(1);
// Arquivamento em vez de exclusão física: preserva histórico e indicadores.
const arquivadoEm = () => timestamp("arquivado_em", { withTimezone: true });

// ───────────────────────── Fundação ─────────────────────────

export const perfilEnum = pgEnum("perfil", ["admin", "gestor", "operador"]);

export const usuario = pgTable("usuario", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: varchar("nome", { length: 120 }).notNull(),
  email: varchar("email", { length: 200 }).notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  perfil: perfilEnum("perfil").notNull().default("operador"),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

// Guardamos só o SHA-256 do token; o token em si fica apenas no cookie do navegador.
export const sessao = pgTable(
  "sessao",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuario.id, { onDelete: "cascade" }),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("sessao_usuario_idx").on(t.usuarioId)],
);

export const tentativaLogin = pgTable(
  "tentativa_login",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chave: varchar("chave", { length: 250 }).notNull(), // email ou IP
    sucesso: boolean("sucesso").notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [index("tentativa_chave_idx").on(t.chave, t.criadoEm)],
);

export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id").references(() => usuario.id, { onDelete: "set null" }),
    acao: varchar("acao", { length: 80 }).notNull(),
    entidade: varchar("entidade", { length: 60 }),
    entidadeId: varchar("entidade_id", { length: 60 }),
    detalhes: jsonb("detalhes"),
    criadoEm: criadoEm(),
  },
  (t) => [index("auditoria_criado_idx").on(t.criadoEm)],
);

export const configuracao = pgTable("configuracao", {
  chave: varchar("chave", { length: 80 }).primaryKey(),
  valor: jsonb("valor").notNull(),
  atualizadoEm: atualizadoEm(),
});

// ───────────────────────── CRM ─────────────────────────

export const empresa = pgTable(
  "empresa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: varchar("nome", { length: 200 }).notNull(),
    documento: varchar("documento", { length: 20 }), // CNPJ só dígitos
    segmento: varchar("segmento", { length: 80 }),
    cidade: varchar("cidade", { length: 120 }),
    uf: varchar("uf", { length: 2 }),
    telefone: varchar("telefone", { length: 30 }),
    site: varchar("site", { length: 200 }),
    observacoes: text("observacoes"),
    responsavelId: uuid("responsavel_id").references(() => usuario.id, { onDelete: "set null" }),
    versao: versao(),
    arquivadoEm: arquivadoEm(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index("empresa_nome_idx").on(t.nome),
    uniqueIndex("empresa_documento_uq").on(t.documento).where(sql`documento is not null`),
    // Regra P2: nome único por cidade (cidade vazia conta como um valor)
    uniqueIndex("empresa_nome_cidade_uq").on(sql`lower(${t.nome})`, sql`lower(coalesce(${t.cidade}, ''))`),
  ],
);

export const contato = pgTable(
  "contato",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id").references(() => empresa.id, { onDelete: "set null" }),
    nome: varchar("nome", { length: 200 }).notNull(),
    email: varchar("email", { length: 200 }),
    telefone: varchar("telefone", { length: 30 }),
    cargo: varchar("cargo", { length: 100 }),
    // Opt-out: bloqueia qualquer follow-up automático para este contato.
    descadastrado: boolean("descadastrado").notNull().default(false),
    versao: versao(),
    arquivadoEm: arquivadoEm(),
    anonimizadoEm: timestamp("anonimizado_em", { withTimezone: true }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index("contato_empresa_idx").on(t.empresaId), uniqueIndex("contato_email_uq").on(t.email).where(sql`email is not null`)],
);

export const etapaPipeline = pgTable("etapa_pipeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: varchar("nome", { length: 80 }).notNull(),
  ordem: integer("ordem").notNull(),
  // aberta | ganha | perdida — define se a oportunidade foi encerrada ao entrar na etapa
  tipo: varchar("tipo", { length: 10 }).notNull().default("aberta"),
  probabilidade: integer("probabilidade").notNull().default(0), // 0–100
  ativa: boolean("ativa").notNull().default(true),
});

export const oportunidade = pgTable(
  "oportunidade",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    empresaId: uuid("empresa_id").references(() => empresa.id, { onDelete: "set null" }),
    contatoId: uuid("contato_id").references(() => contato.id, { onDelete: "set null" }),
    etapaId: uuid("etapa_id")
      .notNull()
      .references(() => etapaPipeline.id),
    responsavelId: uuid("responsavel_id").references(() => usuario.id, { onDelete: "set null" }),
    origem: varchar("origem", { length: 60 }), // ligacao, indicacao, site, chat_ia...
    valor: dinheiro("valor").notNull().default("0"), // valor mensal estimado (MRR)
    // aberta | ganha | perdida (espelha o tipo da etapa atual)
    situacao: varchar("situacao", { length: 10 }).notNull().default("aberta"),
    motivoPerda: varchar("motivo_perda", { length: 200 }),
    previsaoFechamento: date("previsao_fechamento"),
    fechadaEm: timestamp("fechada_em", { withTimezone: true }),
    versao: versao(),
    arquivadoEm: arquivadoEm(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index("oport_etapa_idx").on(t.etapaId), index("oport_situacao_idx").on(t.situacao)],
);

// Histórico unificado: interações (ligação, e-mail, nota) e alterações automáticas.
export const interacao = pgTable(
  "interacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: varchar("tipo", { length: 20 }).notNull(), // nota | ligacao | email | whatsapp | reuniao | alteracao | chat_ia
    descricao: text("descricao").notNull(),
    empresaId: uuid("empresa_id").references(() => empresa.id, { onDelete: "cascade" }),
    contatoId: uuid("contato_id").references(() => contato.id, { onDelete: "cascade" }),
    oportunidadeId: uuid("oportunidade_id").references(() => oportunidade.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id").references(() => usuario.id, { onDelete: "set null" }),
    // true = o contato respondeu (encerra sequências de follow-up)
    respostaDoContato: boolean("resposta_do_contato").notNull().default(false),
    criadoEm: criadoEm(),
  },
  (t) => [index("interacao_oport_idx").on(t.oportunidadeId), index("interacao_contato_idx").on(t.contatoId)],
);

export const tarefa = pgTable(
  "tarefa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    descricao: text("descricao"),
    venceEm: timestamp("vence_em", { withTimezone: true }),
    concluida: boolean("concluida").notNull().default(false),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
    responsavelId: uuid("responsavel_id").references(() => usuario.id, { onDelete: "set null" }),
    empresaId: uuid("empresa_id").references(() => empresa.id, { onDelete: "cascade" }),
    contatoId: uuid("contato_id").references(() => contato.id, { onDelete: "cascade" }),
    oportunidadeId: uuid("oportunidade_id").references(() => oportunidade.id, { onDelete: "cascade" }),
    origem: varchar("origem", { length: 20 }).notNull().default("manual"), // manual | automacao | follow_up
    criadoEm: criadoEm(),
  },
  (t) => [index("tarefa_vence_idx").on(t.concluida, t.venceEm)],
);

// Catálogo de planos/produtos vendidos (preço de tabela). O contrato guarda nome e valores
// copiados no momento da venda, então mudar o preço aqui não altera contratos já firmados.
export const plano = pgTable(
  "plano",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: varchar("nome", { length: 60 }).notNull(),
    valorMensal: dinheiro("valor_mensal").notNull(),
    valorSetup: dinheiro("valor_setup").notNull().default("0"),
    descricao: varchar("descricao", { length: 300 }),
    ativo: boolean("ativo").notNull().default(true),
    ordem: integer("ordem").notNull().default(0),
    versao: versao(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("plano_nome_uq").on(sql`lower(${t.nome})`),
    check("plano_valores_ck", sql`${t.valorMensal} > 0 and ${t.valorSetup} >= 0`),
  ],
);

export const contrato = pgTable(
  "contrato",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresa.id, { onDelete: "restrict" }),
    oportunidadeId: uuid("oportunidade_id").references(() => oportunidade.id, { onDelete: "set null" }),
    plano: varchar("plano", { length: 60 }).notNull(),
    valorMensal: dinheiro("valor_mensal").notNull(),
    valorSetup: dinheiro("valor_setup").notNull().default("0"),
    inicio: date("inicio").notNull(),
    fim: date("fim"), // vencimento/renovação
    diaVencimento: integer("dia_vencimento").notNull().default(10),
    situacao: varchar("situacao", { length: 12 }).notNull().default("ativo"), // ativo | suspenso | cancelado
    // Motivo da última suspensão/cancelamento e data do cancelamento (cancelado é definitivo)
    motivoSituacao: varchar("motivo_situacao", { length: 200 }),
    canceladoEm: timestamp("cancelado_em", { withTimezone: true }),
    observacoes: text("observacoes"),
    versao: versao(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index("contrato_fim_idx").on(t.fim),
    check("contrato_situacao_ck", sql`${t.situacao} in ('ativo','suspenso','cancelado')`),
    check("contrato_vigencia_ck", sql`${t.fim} is null or ${t.fim} >= ${t.inicio}`),
  ],
);

// ───────────────────────── Eventos (fila para automações) ─────────────────────────

// Todo fato relevante do sistema vira um evento; o motor de automações consome esta fila.
export const evento = pgTable(
  "evento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: varchar("tipo", { length: 60 }).notNull(),
    payload: jsonb("payload").notNull(),
    // Chave opcional para evitar eventos duplicados (ex.: webhook reenviado)
    chaveIdempotencia: varchar("chave_idempotencia", { length: 200 }),
    processadoEm: timestamp("processado_em", { withTimezone: true }),
    // pendente | processado | falhou (falhou = esgotou tentativas, exige intervenção)
    situacao: varchar("situacao", { length: 12 }).notNull().default("pendente"),
    tentativas: integer("tentativas").notNull().default(0),
    proximaTentativaEm: timestamp("proxima_tentativa_em", { withTimezone: true }),
    ultimoErro: text("ultimo_erro"),
    criadoEm: criadoEm(),
  },
  (t) => [
    index("evento_pendente_idx").on(t.situacao, t.proximaTentativaEm, t.criadoEm),
    uniqueIndex("evento_idem_uq").on(t.chaveIdempotencia),
    check("evento_situacao_ck", sql`${t.situacao} in ('pendente','processado','falhou')`),
  ],
);

// ───────────────────────── Financeiro ─────────────────────────

export const categoriaFinanceira = pgTable(
  "categoria_financeira",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: varchar("nome", { length: 80 }).notNull(),
    tipo: varchar("tipo", { length: 10 }).notNull(), // receita | despesa
    ativa: boolean("ativa").notNull().default(true),
    criadoEm: criadoEm(),
  },
  (t) => [uniqueIndex("categoria_nome_tipo_uq").on(sql`lower(${t.nome})`, t.tipo), check("categoria_tipo_ck", sql`${t.tipo} in ('receita','despesa')`)],
);

export const lancamento = pgTable(
  "lancamento",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tipo: varchar("tipo", { length: 10 }).notNull(), // receita | despesa
    descricao: varchar("descricao", { length: 200 }).notNull(),
    categoriaId: uuid("categoria_id")
      .notNull()
      .references(() => categoriaFinanceira.id),
    valor: dinheiro("valor").notNull(), // valor previsto (> 0)
    competencia: date("competencia").notNull(), // sempre o dia 1 do mês de referência
    vencimento: date("vencimento").notNull(),
    // pendente | pago | cancelado
    situacao: varchar("situacao", { length: 10 }).notNull().default("pendente"),
    pagoEm: date("pago_em"),
    valorPago: dinheiro("valor_pago"),
    motivoCancelamento: varchar("motivo_cancelamento", { length: 200 }),
    // manual | mensalidade | setup
    origem: varchar("origem", { length: 12 }).notNull().default("manual"),
    empresaId: uuid("empresa_id").references(() => empresa.id, { onDelete: "restrict" }),
    contratoId: uuid("contrato_id").references(() => contrato.id, { onDelete: "restrict" }),
    observacao: text("observacao"),
    criadoPorId: uuid("criado_por_id").references(() => usuario.id, { onDelete: "set null" }),
    versao: versao(),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    index("lanc_vencimento_idx").on(t.situacao, t.vencimento),
    index("lanc_pago_idx").on(t.pagoEm),
    index("lanc_competencia_idx").on(t.competencia),
    // Idempotência da geração de cobranças a partir de contratos
    uniqueIndex("lanc_mensalidade_uq").on(t.contratoId, t.competencia).where(sql`origem = 'mensalidade'`),
    uniqueIndex("lanc_setup_uq").on(t.contratoId).where(sql`origem = 'setup'`),
    // Consistência garantida pelo banco, não só pela aplicação
    check("lanc_tipo_ck", sql`${t.tipo} in ('receita','despesa')`),
    check("lanc_situacao_ck", sql`${t.situacao} in ('pendente','pago','cancelado')`),
    check("lanc_valor_ck", sql`${t.valor} > 0 and (${t.valorPago} is null or ${t.valorPago} >= 0)`),
    check("lanc_competencia_ck", sql`extract(day from ${t.competencia}) = 1`),
    check("lanc_baixa_ck", sql`(${t.situacao} = 'pago') = (${t.pagoEm} is not null and ${t.valorPago} is not null)`),
    check("lanc_cancel_ck", sql`(${t.situacao} = 'cancelado') = (${t.motivoCancelamento} is not null)`),
  ],
);

// ───────────────────────── Automações ─────────────────────────

// Gatilho → condições → ações. Condições e ações em JSON validado por Zod (lib/automacoes/tipos.ts).
export const automacao = pgTable(
  "automacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: varchar("nome", { length: 120 }).notNull(),
    gatilho: varchar("gatilho", { length: 60 }).notNull(),
    condicoes: jsonb("condicoes").notNull().default({}),
    acoes: jsonb("acoes").notNull(),
    ativa: boolean("ativa").notNull().default(true),
    versao: versao(),
    criadoPorId: uuid("criado_por_id").references(() => usuario.id, { onDelete: "set null" }),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index("automacao_gatilho_idx").on(t.gatilho, t.ativa)],
);

// Uma linha por (automação, evento): o índice único é o que impede execução duplicada.
export const execucaoAutomacao = pgTable(
  "execucao_automacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automacaoId: uuid("automacao_id")
      .notNull()
      .references(() => automacao.id, { onDelete: "cascade" }),
    eventoId: uuid("evento_id")
      .notNull()
      .references(() => evento.id, { onDelete: "cascade" }),
    // sucesso | ignorada (condição não atendida) | erro
    situacao: varchar("situacao", { length: 10 }).notNull(),
    tentativas: integer("tentativas").notNull().default(1),
    detalhes: jsonb("detalhes"),
    erro: text("erro"),
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [
    uniqueIndex("execucao_automacao_evento_uq").on(t.automacaoId, t.eventoId),
    index("execucao_criado_idx").on(t.criadoEm),
    check("execucao_situacao_ck", sql`${t.situacao} in ('sucesso','ignorada','erro')`),
  ],
);

export const notificacao = pgTable(
  "notificacao",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuario.id, { onDelete: "cascade" }),
    titulo: varchar("titulo", { length: 200 }).notNull(),
    mensagem: text("mensagem"),
    link: varchar("link", { length: 300 }),
    lidaEm: timestamp("lida_em", { withTimezone: true }),
    // Evita notificar duas vezes pelo mesmo motivo (ex.: automação + evento)
    chave: varchar("chave", { length: 200 }),
    criadoEm: criadoEm(),
  },
  (t) => [index("notificacao_usuario_idx").on(t.usuarioId, t.lidaEm), uniqueIndex("notificacao_chave_uq").on(t.usuarioId, t.chave)],
);

export const sequenciaFollowup = pgTable("sequencia_followup", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: varchar("nome", { length: 120 }).notNull(),
  // [{ aposDias: number, titulo: string }]
  passos: jsonb("passos").notNull(),
  ativa: boolean("ativa").notNull().default(true),
  criadoEm: criadoEm(),
  atualizadoEm: atualizadoEm(),
});

export const inscricaoFollowup = pgTable(
  "inscricao_followup",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenciaId: uuid("sequencia_id")
      .notNull()
      .references(() => sequenciaFollowup.id, { onDelete: "cascade" }),
    oportunidadeId: uuid("oportunidade_id")
      .notNull()
      .references(() => oportunidade.id, { onDelete: "cascade" }),
    contatoId: uuid("contato_id").references(() => contato.id, { onDelete: "set null" }),
    passoAtual: integer("passo_atual").notNull().default(0), // índice do próximo passo
    proximoEm: timestamp("proximo_em", { withTimezone: true }),
    // ativa | concluida | interrompida
    situacao: varchar("situacao", { length: 12 }).notNull().default("ativa"),
    motivoParada: varchar("motivo_parada", { length: 120 }),
    iniciadaEm: criadoEm(),
    encerradaEm: timestamp("encerrada_em", { withTimezone: true }),
  },
  (t) => [
    index("inscricao_proximo_idx").on(t.situacao, t.proximoEm),
    // Uma oportunidade não fica inscrita duas vezes, ao mesmo tempo, na mesma sequência
    uniqueIndex("inscricao_ativa_uq").on(t.sequenciaId, t.oportunidadeId).where(sql`situacao = 'ativa'`),
    check("inscricao_situacao_ck", sql`${t.situacao} in ('ativa','concluida','interrompida')`),
  ],
);

// Origem de captação (landing page, formulário, n8n). modo: hmac (servidor-a-servidor) | publico (formulário no site).
export const origemCaptacao = pgTable("origem_captacao", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: varchar("nome", { length: 120 }).notNull(),
  modo: varchar("modo", { length: 8 }).notNull(),
  // Segredo HMAC (modo hmac). Necessário em texto para verificar a assinatura; exibido só na criação/rotação.
  segredo: varchar("segredo", { length: 100 }),
  etapaId: uuid("etapa_id")
    .notNull()
    .references(() => etapaPipeline.id),
  origemRotulo: varchar("origem_rotulo", { length: 60 }).notNull().default("site"),
  // Domínio autorizado para o formulário público (CORS). Ex.: https://minhaempresa.com.br
  dominioPermitido: varchar("dominio_permitido", { length: 200 }),
  ativa: boolean("ativa").notNull().default(true),
  recebidos: integer("recebidos").notNull().default(0),
  ultimoRecebimentoEm: timestamp("ultimo_recebimento_em", { withTimezone: true }),
  criadoEm: criadoEm(),
});

// ───────────────────────── Consumo e franquia ─────────────────────────

// Cada uso de recurso pago (IA, WhatsApp) vira uma linha. `referencia` é a chave de idempotência:
// a mesma conversa/mensagem nunca é contada duas vezes, mesmo com reprocessamento.
export const consumoUso = pgTable(
  "consumo_uso",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recurso: varchar("recurso", { length: 30 }).notNull(),
    quantidade: integer("quantidade").notNull(),
    custoEstimado: dinheiro("custo_estimado"),
    referencia: varchar("referencia", { length: 200 }).notNull(),
    criadoEm: criadoEm(),
  },
  (t) => [
    uniqueIndex("consumo_referencia_uq").on(t.recurso, t.referencia),
    index("consumo_recurso_data_idx").on(t.recurso, t.criadoEm),
    check("consumo_recurso_ck", sql`${t.recurso} in ('ia_conversa','ia_tokens','whatsapp_conversa')`),
    check("consumo_quantidade_ck", sql`${t.quantidade} > 0`),
  ],
);
