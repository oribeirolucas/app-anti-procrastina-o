CREATE TABLE "unidade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(80) NOT NULL,
	"numero_id" varchar(40) NOT NULL,
	"numero_exibicao" varchar(30),
	"informacoes" text DEFAULT '' NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "conversa_canal_externo_uq";--> statement-breakpoint
ALTER TABLE "agendamento" ADD COLUMN "unidade_id" uuid;--> statement-breakpoint
ALTER TABLE "campanha" ADD COLUMN "unidade_id" uuid;--> statement-breakpoint
ALTER TABLE "conversa" ADD COLUMN "unidade_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "unidade_numero_uq" ON "unidade" USING btree ("numero_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unidade_nome_uq" ON "unidade" USING btree (lower("nome"));--> statement-breakpoint
ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_unidade_id_unidade_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanha" ADD CONSTRAINT "campanha_unidade_id_unidade_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_unidade_id_unidade_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidade"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_canal_externo_unidade_uq" UNIQUE NULLS NOT DISTINCT("canal","id_externo","unidade_id");