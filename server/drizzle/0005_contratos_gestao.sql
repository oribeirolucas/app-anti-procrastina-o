ALTER TABLE "contrato" ADD COLUMN "motivo_situacao" varchar(200);--> statement-breakpoint
ALTER TABLE "contrato" ADD COLUMN "cancelado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contrato" ADD COLUMN "observacoes" text;--> statement-breakpoint
ALTER TABLE "contrato" ADD COLUMN "versao" integer DEFAULT 1 NOT NULL;