CREATE TYPE "public"."categoria_veiculo" AS ENUM('hatch_sedan_popular', 'suv_compacto', 'suv_medio', 'picape', 'eletrico_hibrido');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnostico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"respostas" jsonb NOT NULL,
	"km_mes_faixa" varchar,
	"pessoas_transportadas" integer,
	"orcamento_min" numeric,
	"orcamento_max" numeric,
	"financiamento" boolean,
	"prioridades" jsonb,
	"horizonte_posse" varchar,
	"primeira_compra" boolean,
	"cambio_restricao" varchar,
	"combustivel_restricao" varchar,
	"categoria_inferida" "categoria_veiculo",
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "interacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"tipo" varchar NOT NULL,
	"veiculo_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"recomendacao_id" uuid,
	"status" varchar DEFAULT 'novo',
	"concessionaria_destino" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lista_espera_categoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid,
	"categoria" "categoria_veiculo" NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recomendacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnostico_id" uuid,
	"veiculo_id" uuid,
	"score" numeric NOT NULL,
	"motivo" text NOT NULL,
	"posicao" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar,
	"telefone" varchar,
	"cidade" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "veiculo_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"veiculo_id" uuid,
	"alias" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "veiculo_tecnico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marca" varchar NOT NULL,
	"modelo" varchar NOT NULL,
	"versao" varchar NOT NULL,
	"ano" integer NOT NULL,
	"categoria" "categoria_veiculo" NOT NULL,
	"preco_referencia" numeric NOT NULL,
	"cambio" varchar NOT NULL,
	"combustivel" varchar NOT NULL,
	"score_economia" integer,
	"score_seguranca" integer,
	"score_espaco" integer,
	"score_manutencao" integer,
	"score_revenda" integer,
	"capacidade_carga_kg" integer,
	"tracao_4x4" boolean,
	"altura_livre_solo_mm" integer,
	"autonomia_km" integer,
	"tempo_recarga_min" integer,
	"ativo" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "diagnostico" ADD CONSTRAINT "diagnostico_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interacao" ADD CONSTRAINT "interacao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "interacao" ADD CONSTRAINT "interacao_veiculo_id_veiculo_tecnico_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo_tecnico"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead" ADD CONSTRAINT "lead_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead" ADD CONSTRAINT "lead_recomendacao_id_recomendacao_id_fk" FOREIGN KEY ("recomendacao_id") REFERENCES "public"."recomendacao"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lista_espera_categoria" ADD CONSTRAINT "lista_espera_categoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recomendacao" ADD CONSTRAINT "recomendacao_diagnostico_id_diagnostico_id_fk" FOREIGN KEY ("diagnostico_id") REFERENCES "public"."diagnostico"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recomendacao" ADD CONSTRAINT "recomendacao_veiculo_id_veiculo_tecnico_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo_tecnico"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "veiculo_alias" ADD CONSTRAINT "veiculo_alias_veiculo_id_veiculo_tecnico_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo_tecnico"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
