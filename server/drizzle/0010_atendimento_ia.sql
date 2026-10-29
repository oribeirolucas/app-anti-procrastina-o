ALTER TABLE "conversa" ADD COLUMN "processando_ate" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN "processada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN "tentativas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN "enviada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN "erro_envio" varchar(300);--> statement-breakpoint
CREATE INDEX "contato_telefone_idx" ON "contato" USING btree ("telefone");--> statement-breakpoint
CREATE INDEX "mensagem_fila_idx" ON "mensagem" USING btree ("autor","processada_em") WHERE processada_em is null;