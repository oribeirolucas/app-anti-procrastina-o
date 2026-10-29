ALTER TABLE "consumo_uso" DROP CONSTRAINT "consumo_recurso_ck";--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN "midia_id" varchar(120);--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN "midia_tipo" varchar(20);--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN "transcrita_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consumo_uso" ADD CONSTRAINT "consumo_recurso_ck" CHECK ("consumo_uso"."recurso" in ('ia_conversa','ia_tokens','whatsapp_conversa','transcricao_segundos'));