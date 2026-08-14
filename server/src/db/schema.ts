import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  integer,
  decimal,
  boolean,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const categoriaVeiculoEnum = pgEnum("categoria_veiculo", [
  "hatch_sedan_popular",
  "suv_compacto",
  "suv_medio",
  "picape",
  "eletrico_hibrido",
]);

export const veiculoTecnico = pgTable("veiculo_tecnico", {
  id: uuid("id").primaryKey().defaultRandom(),
  marca: varchar("marca").notNull(),
  modelo: varchar("modelo").notNull(),
  versao: varchar("versao").notNull(),
  ano: integer("ano").notNull(),
  categoria: categoriaVeiculoEnum("categoria").notNull(),
  precoReferencia: decimal("preco_referencia").notNull(),
  cambio: varchar("cambio").notNull(), // manual | automatico
  combustivel: varchar("combustivel").notNull(), // flex | hibrido | eletrico | diesel

  // atributos padrão (0-100 normalizado)
  scoreEconomia: integer("score_economia"),
  scoreSeguranca: integer("score_seguranca"),
  scoreEspaco: integer("score_espaco"),
  scoreManutencao: integer("score_manutencao"),
  scoreRevenda: integer("score_revenda"),

  // atributos condicionais
  capacidadeCargaKg: integer("capacidade_carga_kg"), // picape
  tracao4x4: boolean("tracao_4x4"), // picape
  alturaLivreSoloMm: integer("altura_livre_solo_mm"), // picape
  autonomiaKm: integer("autonomia_km"), // eletrico_hibrido
  tempoRecargaMin: integer("tempo_recarga_min"), // eletrico_hibrido

  ativo: boolean("ativo").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const veiculoAlias = pgTable("veiculo_alias", {
  id: uuid("id").primaryKey().defaultRandom(),
  veiculoId: uuid("veiculo_id").references(() => veiculoTecnico.id),
  alias: varchar("alias").notNull(),
});

export const usuario = pgTable("usuario", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: varchar("nome"),
  telefone: varchar("telefone"),
  cidade: varchar("cidade"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const diagnostico = pgTable("diagnostico", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id").references(() => usuario.id),
  respostas: jsonb("respostas").notNull(),
  kmMesFaixa: varchar("km_mes_faixa"),
  pessoasTransportadas: integer("pessoas_transportadas"),
  orcamentoMin: decimal("orcamento_min"),
  orcamentoMax: decimal("orcamento_max"),
  financiamento: boolean("financiamento"),
  prioridades: jsonb("prioridades"),
  horizontePosse: varchar("horizonte_posse"),
  primeiraCompra: boolean("primeira_compra"),
  cambioRestricao: varchar("cambio_restricao"),
  combustivelRestricao: varchar("combustivel_restricao"),
  categoriaInferida: categoriaVeiculoEnum("categoria_inferida"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const recomendacao = pgTable("recomendacao", {
  id: uuid("id").primaryKey().defaultRandom(),
  diagnosticoId: uuid("diagnostico_id").references(() => diagnostico.id),
  veiculoId: uuid("veiculo_id").references(() => veiculoTecnico.id),
  score: decimal("score").notNull(),
  motivo: text("motivo").notNull(),
  posicao: integer("posicao").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const interacao = pgTable("interacao", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id").references(() => usuario.id),
  tipo: varchar("tipo").notNull(), // visualizou | comparou | quis_oferta | feedback_pos_compra
  veiculoId: uuid("veiculo_id").references(() => veiculoTecnico.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const lead = pgTable("lead", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id").references(() => usuario.id),
  recomendacaoId: uuid("recomendacao_id").references(() => recomendacao.id),
  status: varchar("status").default("novo"), // novo | contatado | convertido | perdido
  concessionariaDestino: varchar("concessionaria_destino"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const listaEsperaCategoria = pgTable("lista_espera_categoria", {
  id: uuid("id").primaryKey().defaultRandom(),
  usuarioId: uuid("usuario_id").references(() => usuario.id),
  categoria: categoriaVeiculoEnum("categoria").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
