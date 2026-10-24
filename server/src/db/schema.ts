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
    uniqueIndex("empresa_nome_uq").on(sql`lower(${t.nome})`),
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
    criadoEm: criadoEm(),
    atualizadoEm: atualizadoEm(),
  },
  (t) => [index("contrato_fim_idx").on(t.fim)],
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
    criadoEm: criadoEm(),
  },
  (t) => [index("evento_pendente_idx").on(t.processadoEm, t.criadoEm), uniqueIndex("evento_idem_uq").on(t.chaveIdempotencia)],
);
