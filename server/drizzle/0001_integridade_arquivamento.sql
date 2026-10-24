-- Verificação prévia: os índices únicos abaixo falhariam se houver duplicados.
-- Se esta migração abortar, resolva os duplicados listados na mensagem e rode novamente (nada é alterado).
DO $$
DECLARE d text;
BEGIN
  SELECT string_agg(nome, ', ') INTO d FROM (SELECT lower(nome) AS nome FROM empresa GROUP BY lower(nome) HAVING count(*) > 1) x;
  IF d IS NOT NULL THEN RAISE EXCEPTION 'Empresas com nome duplicado: %', d; END IF;
  SELECT string_agg(documento, ', ') INTO d FROM (SELECT documento FROM empresa WHERE documento IS NOT NULL GROUP BY documento HAVING count(*) > 1) x;
  IF d IS NOT NULL THEN RAISE EXCEPTION 'Empresas com CNPJ duplicado: %', d; END IF;
  SELECT count(*)::text INTO d FROM (SELECT email FROM contato WHERE email IS NOT NULL GROUP BY email HAVING count(*) > 1) x;
  IF d <> '0' THEN RAISE EXCEPTION 'Existem % e-mails de contato duplicados', d; END IF;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "contato_email_idx";--> statement-breakpoint
ALTER TABLE "contato" ADD COLUMN "versao" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "contato" ADD COLUMN "arquivado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contato" ADD COLUMN "anonimizado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "empresa" ADD COLUMN "versao" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "empresa" ADD COLUMN "arquivado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD COLUMN "versao" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "oportunidade" ADD COLUMN "arquivado_em" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contato_email_uq" ON "contato" USING btree ("email") WHERE email is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "empresa_documento_uq" ON "empresa" USING btree ("documento") WHERE documento is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "empresa_nome_uq" ON "empresa" USING btree (lower("nome"));