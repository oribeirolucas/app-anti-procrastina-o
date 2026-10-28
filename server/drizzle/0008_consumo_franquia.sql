CREATE TABLE "consumo_uso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurso" varchar(30) NOT NULL,
	"quantidade" integer NOT NULL,
	"custo_estimado" numeric(14, 2),
	"referencia" varchar(200) NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumo_recurso_ck" CHECK ("consumo_uso"."recurso" in ('ia_conversa','ia_tokens','whatsapp_conversa')),
	CONSTRAINT "consumo_quantidade_ck" CHECK ("consumo_uso"."quantidade" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "consumo_referencia_uq" ON "consumo_uso" USING btree ("recurso","referencia");--> statement-breakpoint
CREATE INDEX "consumo_recurso_data_idx" ON "consumo_uso" USING btree ("recurso","criado_em");