CREATE TABLE "agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(80) NOT NULL,
	"area" varchar(20) NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"provedor" varchar(12) DEFAULT 'anthropic' NOT NULL,
	"modelo" varchar(60) NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agente_area_ck" CHECK ("agente"."area" in ('marketing','comercial','cs','financeiro')),
	CONSTRAINT "agente_provedor_ck" CHECK ("agente"."provedor" in ('anthropic','openai','google'))
);
--> statement-breakpoint
CREATE TABLE "conversa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canal" varchar(12) DEFAULT 'whatsapp' NOT NULL,
	"id_externo" varchar(120) NOT NULL,
	"nome_exibicao" varchar(120),
	"contato_id" uuid,
	"agente_id" uuid,
	"situacao" varchar(10) DEFAULT 'ia' NOT NULL,
	"ultima_mensagem_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversa_situacao_ck" CHECK ("conversa"."situacao" in ('ia','humano','encerrada'))
);
--> statement-breakpoint
CREATE TABLE "execucao_agente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agente_id" uuid NOT NULL,
	"situacao" varchar(12) NOT NULL,
	"resumo" varchar(300) NOT NULL,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_saida" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"duracao_ms" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exec_agente_situacao_ck" CHECK ("execucao_agente"."situacao" in ('ok','erro','bloqueada'))
);
--> statement-breakpoint
CREATE TABLE "mensagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"autor" varchar(8) NOT NULL,
	"texto" text NOT NULL,
	"id_externo" varchar(120),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mensagem_autor_ck" CHECK ("mensagem"."autor" in ('cliente','ia','humano'))
);
--> statement-breakpoint
CREATE TABLE "solicitacao_aprovacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(12) NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"descricao" text,
	"valor" numeric(14, 2),
	"agente_id" uuid,
	"referencia" varchar(200) NOT NULL,
	"situacao" varchar(10) DEFAULT 'pendente' NOT NULL,
	"decidido_por_id" uuid,
	"decidido_em" timestamp with time zone,
	"motivo_decisao" varchar(300),
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "aprovacao_tipo_ck" CHECK ("solicitacao_aprovacao"."tipo" in ('orcamento','desconto','deploy','outro')),
	CONSTRAINT "aprovacao_situacao_ck" CHECK ("solicitacao_aprovacao"."situacao" in ('pendente','aprovada','recusada')),
	CONSTRAINT "aprovacao_decisao_ck" CHECK (("solicitacao_aprovacao"."situacao" = 'pendente') = ("solicitacao_aprovacao"."decidido_em" is null)),
	CONSTRAINT "aprovacao_recusa_ck" CHECK ("solicitacao_aprovacao"."situacao" <> 'recusada' or "solicitacao_aprovacao"."motivo_decisao" is not null)
);
--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_agente_id_agente_id_fk" FOREIGN KEY ("agente_id") REFERENCES "public"."agente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_agente" ADD CONSTRAINT "execucao_agente_agente_id_agente_id_fk" FOREIGN KEY ("agente_id") REFERENCES "public"."agente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacao_aprovacao" ADD CONSTRAINT "solicitacao_aprovacao_agente_id_agente_id_fk" FOREIGN KEY ("agente_id") REFERENCES "public"."agente"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacao_aprovacao" ADD CONSTRAINT "solicitacao_aprovacao_decidido_por_id_usuario_id_fk" FOREIGN KEY ("decidido_por_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agente_nome_uq" ON "agente" USING btree (lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "conversa_canal_externo_uq" ON "conversa" USING btree ("canal","id_externo");--> statement-breakpoint
CREATE INDEX "conversa_ultima_idx" ON "conversa" USING btree ("situacao","ultima_mensagem_em");--> statement-breakpoint
CREATE INDEX "exec_agente_idx" ON "execucao_agente" USING btree ("agente_id","criado_em");--> statement-breakpoint
CREATE INDEX "mensagem_conversa_idx" ON "mensagem" USING btree ("conversa_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "mensagem_externo_uq" ON "mensagem" USING btree ("conversa_id","id_externo");--> statement-breakpoint
CREATE UNIQUE INDEX "aprovacao_referencia_uq" ON "solicitacao_aprovacao" USING btree ("referencia");--> statement-breakpoint
CREATE INDEX "aprovacao_situacao_idx" ON "solicitacao_aprovacao" USING btree ("situacao","criado_em");