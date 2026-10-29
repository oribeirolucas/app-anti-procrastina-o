ALTER TABLE "plano" ADD COLUMN "promessa" varchar(120);--> statement-breakpoint
ALTER TABLE "plano" ADD COLUMN "publico_ideal" varchar(200);--> statement-breakpoint
ALTER TABLE "plano" ADD COLUMN "franquia_conversas" integer;--> statement-breakpoint
ALTER TABLE "plano" ADD COLUMN "entregaveis" jsonb DEFAULT '[]'::jsonb NOT NULL;