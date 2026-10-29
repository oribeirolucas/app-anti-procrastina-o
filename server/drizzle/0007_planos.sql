CREATE TABLE "plano" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(60) NOT NULL,
	"valor_mensal" numeric(14, 2) NOT NULL,
	"valor_setup" numeric(14, 2) DEFAULT '0' NOT NULL,
	"descricao" varchar(300),
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plano_valores_ck" CHECK ("plano"."valor_mensal" > 0 and "plano"."valor_setup" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plano_nome_uq" ON "plano" USING btree (lower("nome"));