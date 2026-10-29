DROP INDEX IF EXISTS "empresa_nome_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "empresa_nome_cidade_uq" ON "empresa" USING btree (lower("nome"),lower(coalesce("cidade", '')));