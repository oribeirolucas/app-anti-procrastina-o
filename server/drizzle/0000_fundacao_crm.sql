CREATE TYPE "public"."perfil" AS ENUM('admin', 'gestor', 'operador');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"acao" varchar(80) NOT NULL,
	"entidade" varchar(60),
	"entidade_id" varchar(60),
	"detalhes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "configuracao" (
	"chave" varchar(80) PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"nome" varchar(200) NOT NULL,
	"email" varchar(200),
	"telefone" varchar(30),
	"cargo" varchar(100),
	"descadastrado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contrato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"oportunidade_id" uuid,
	"plano" varchar(60) NOT NULL,
	"valor_mensal" numeric(14, 2) NOT NULL,
	"valor_setup" numeric(14, 2) DEFAULT '0' NOT NULL,
	"inicio" date NOT NULL,
	"fim" date,
	"dia_vencimento" integer DEFAULT 10 NOT NULL,
	"situacao" varchar(12) DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(200) NOT NULL,
	"documento" varchar(20),
	"segmento" varchar(80),
	"cidade" varchar(120),
	"uf" varchar(2),
	"telefone" varchar(30),
	"site" varchar(200),
	"observacoes" text,
	"responsavel_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "etapa_pipeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(80) NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" varchar(10) DEFAULT 'aberta' NOT NULL,
	"probabilidade" integer DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(60) NOT NULL,
	"payload" jsonb NOT NULL,
	"chave_idempotencia" varchar(200),
	"processado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(20) NOT NULL,
	"descricao" text NOT NULL,
	"empresa_id" uuid,
	"contato_id" uuid,
	"oportunidade_id" uuid,
	"usuario_id" uuid,
	"resposta_do_contato" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oportunidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"empresa_id" uuid,
	"contato_id" uuid,
	"etapa_id" uuid NOT NULL,
	"responsavel_id" uuid,
	"origem" varchar(60),
	"valor" numeric(14, 2) DEFAULT '0' NOT NULL,
	"situacao" varchar(10) DEFAULT 'aberta' NOT NULL,
	"motivo_perda" varchar(200),
	"previsao_fechamento" date,
	"fechada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessao" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tarefa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" varchar(200) NOT NULL,
	"descricao" text,
	"vence_em" timestamp with time zone,
	"concluida" boolean DEFAULT false NOT NULL,
	"concluida_em" timestamp with time zone,
	"responsavel_id" uuid,
	"empresa_id" uuid,
	"contato_id" uuid,
	"oportunidade_id" uuid,
	"origem" varchar(20) DEFAULT 'manual' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tentativa_login" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" varchar(250) NOT NULL,
	"sucesso" boolean NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"email" varchar(200) NOT NULL,
	"senha_hash" text NOT NULL,
	"perfil" "perfil" DEFAULT 'operador' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contato" ADD CONSTRAINT "contato_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contrato" ADD CONSTRAINT "contrato_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contrato" ADD CONSTRAINT "contrato_oportunidade_id_oportunidade_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidade"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "empresa" ADD CONSTRAINT "empresa_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interacao" ADD CONSTRAINT "interacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interacao" ADD CONSTRAINT "interacao_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interacao" ADD CONSTRAINT "interacao_oportunidade_id_oportunidade_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidade"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interacao" ADD CONSTRAINT "interacao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_etapa_id_etapa_pipeline_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."etapa_pipeline"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oportunidade" ADD CONSTRAINT "oportunidade_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tarefa" ADD CONSTRAINT "tarefa_oportunidade_id_oportunidade_id_fk" FOREIGN KEY ("oportunidade_id") REFERENCES "public"."oportunidade"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auditoria_criado_idx" ON "auditoria" USING btree ("criado_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contato_empresa_idx" ON "contato" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contato_email_idx" ON "contato" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contrato_fim_idx" ON "contrato" USING btree ("fim");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "empresa_nome_idx" ON "empresa" USING btree ("nome");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evento_pendente_idx" ON "evento" USING btree ("processado_em","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evento_idem_uq" ON "evento" USING btree ("chave_idempotencia");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interacao_oport_idx" ON "interacao" USING btree ("oportunidade_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interacao_contato_idx" ON "interacao" USING btree ("contato_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oport_etapa_idx" ON "oportunidade" USING btree ("etapa_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oport_situacao_idx" ON "oportunidade" USING btree ("situacao");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessao_usuario_idx" ON "sessao" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tarefa_vence_idx" ON "tarefa" USING btree ("concluida","vence_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tentativa_chave_idx" ON "tentativa_login" USING btree ("chave","criado_em");