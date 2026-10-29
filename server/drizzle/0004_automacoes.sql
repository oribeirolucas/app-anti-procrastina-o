CREATE TABLE "automacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"gatilho" varchar(60) NOT NULL,
	"condicoes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"acoes" jsonb NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_por_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execucao_automacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"automacao_id" uuid NOT NULL,
	"evento_id" uuid NOT NULL,
	"situacao" varchar(10) NOT NULL,
	"tentativas" integer DEFAULT 1 NOT NULL,
	"detalhes" jsonb,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execucao_situacao_ck" CHECK ("execucao_automacao"."situacao" in ('sucesso','ignorada','erro'))
);
--> statement-breakpoint
CREATE TABLE "inscricao_followup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequencia_id" uuid NOT NULL,
	"oportunidade_id" uuid NOT NULL,
	"contato_id" uuid,
	"passo_atual" integer DEFAULT 0 NOT NULL,
	"proximo_em" timestamp with time zone,
	"situacao" varchar(12) DEFAULT 'ativa' NOT NULL,
	"motivo_parada" varchar(120),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone,
	CONSTRAINT "inscricao_situacao_ck" CHECK ("inscricao_followup"."situacao" in ('ativa','concluida','interrompida'))
);
--> statement-breakpoint
CREATE TABLE "notificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"mensagem" text,
	"link" varchar(300),
	"lida_em" timestamp with time zone,
	"chave" varchar(200),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "origem_captacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"modo" varchar(8) NOT NULL,
	"segredo" varchar(100),
	"etapa_id" uuid NOT NULL,
	"origem_rotulo" varchar(60) DEFAULT 'site' NOT NULL,
	"dominio_permitido" varchar(200),
	"ativa" boolean DEFAULT true NOT NULL,
	"recebidos" integer DEFAULT 0 NOT NULL,
	"ultimo_recebimento_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequencia_followup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"passos" jsonb NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "evento_pendente_idx";--> statement-breakpoint
ALTER TABLE "evento" ADD COLUMN "situacao" varchar(12) DEFAULT 'pendente' NOT NULL;--> statement-breakpoint
ALTER TABLE "evento" ADD COLUMN "tentativas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "evento" ADD COLUMN "proxima_tentativa_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "evento" ADD COLUMN "ultimo_erro" text;--> statement-breakpoint
ALTER TABLE "automacao" ADD CONSTRAINT "automacao_criado_por_id_usuario_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_automacao" ADD CONSTRAINT "execucao_automacao_automacao_id_automacao_id_fk" FOREIGN KEY ("automacao_id") REFERENCES "public"."automacao"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execucao_automacao" ADD CONSTRAINT "execucao_automacao_evento_id_evento_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."evento"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscricao_followup" ADD CONSTRAINT "inscricao_followup_sequencia_id_sequencia_followup_id_fk" FOREIGN KEY ("sequencia_id") REFERENCES "public"."sequencia_followup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscricao_followup" ADD CONSTRAINT "inscricao_followup_oportunidade_id_oportunidade_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inscricao_followup" ADD CONSTRAINT "inscricao_followup_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "origem_captacao" ADD CONSTRAINT "origem_captacao_etapa_id_etapa_pipeline_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapa_pipeline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automacao_gatilho_idx" ON "automacao" USING btree ("gatilho","ativa");--> statement-breakpoint
CREATE UNIQUE INDEX "execucao_automacao_evento_uq" ON "execucao_automacao" USING btree ("automacao_id","evento_id");--> statement-breakpoint
CREATE INDEX "execucao_criado_idx" ON "execucao_automacao" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX "inscricao_proximo_idx" ON "inscricao_followup" USING btree ("situacao","proximo_em");--> statement-breakpoint
CREATE UNIQUE INDEX "inscricao_ativa_uq" ON "inscricao_followup" USING btree ("sequencia_id","oportunidade_id") WHERE situacao = 'ativa';--> statement-breakpoint
CREATE INDEX "notificacao_usuario_idx" ON "notificacao" USING btree ("usuario_id","lida_em");--> statement-breakpoint
CREATE UNIQUE INDEX "notificacao_chave_uq" ON "notificacao" USING btree ("usuario_id","chave");--> statement-breakpoint
CREATE INDEX "evento_pendente_idx" ON "evento" USING btree ("situacao","proxima_tentativa_em","criado_em");--> statement-breakpoint
ALTER TABLE "evento" ADD CONSTRAINT "evento_situacao_ck" CHECK ("evento"."situacao" in ('pendente','processado','falhou'));--> statement-breakpoint
-- Eventos gravados antes do motor de automações existir não devem disparar automações novas.
UPDATE "evento" SET "situacao" = 'processado', "processado_em" = now() WHERE "processado_em" IS NULL;
