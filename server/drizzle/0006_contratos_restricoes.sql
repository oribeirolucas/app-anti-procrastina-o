-- Verificação prévia: aborta com mensagem clara se houver contratos fora das novas regras.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM contrato WHERE situacao NOT IN ('ativo','suspenso','cancelado') OR (fim IS NOT NULL AND fim < inicio);
  IF n > 0 THEN RAISE EXCEPTION '% contrato(s) com situação inválida ou fim antes do início: corrija antes de migrar', n; END IF;
END $$;--> statement-breakpoint
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_situacao_ck" CHECK ("contrato"."situacao" in ('ativo','suspenso','cancelado'));--> statement-breakpoint
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_vigencia_ck" CHECK ("contrato"."fim" is null or "contrato"."fim" >= "contrato"."inicio");