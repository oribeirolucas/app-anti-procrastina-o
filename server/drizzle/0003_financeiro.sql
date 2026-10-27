CREATE TABLE IF NOT EXISTS "categoria_financeira" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(80) NOT NULL,
	"tipo" varchar(10) NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categoria_tipo_ck" CHECK ("categoria_financeira"."tipo" in ('receita','despesa'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lancamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" varchar(10) NOT NULL,
	"descricao" varchar(200) NOT NULL,
	"categoria_id" uuid NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"competencia" date NOT NULL,
	"vencimento" date NOT NULL,
	"situacao" varchar(10) DEFAULT 'pendente' NOT NULL,
	"pago_em" date,
	"valor_pago" numeric(14, 2),
	"motivo_cancelamento" varchar(200),
	"origem" varchar(12) DEFAULT 'manual' NOT NULL,
	"empresa_id" uuid,
	"contrato_id" uuid,
	"observacao" text,
	"criado_por_id" uuid,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lanc_tipo_ck" CHECK ("lancamento"."tipo" in ('receita','despesa')),
	CONSTRAINT "lanc_situacao_ck" CHECK ("lancamento"."situacao" in ('pendente','pago','cancelado')),
	CONSTRAINT "lanc_valor_ck" CHECK ("lancamento"."valor" > 0 and ("lancamento"."valor_pago" is null or "lancamento"."valor_pago" >= 0)),
	CONSTRAINT "lanc_competencia_ck" CHECK (extract(day from "lancamento"."competencia") = 1),
	CONSTRAINT "lanc_baixa_ck" CHECK (("lancamento"."situacao" = 'pago') = ("lancamento"."pago_em" is not null and "lancamento"."valor_pago" is not null)),
	CONSTRAINT "lanc_cancel_ck" CHECK (("lancamento"."situacao" = 'cancelado') = ("lancamento"."motivo_cancelamento" is not null))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_categoria_id_categoria_financeira_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria_financeira"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_contrato_id_contrato_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contrato"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lancamento" ADD CONSTRAINT "lancamento_criado_por_id_usuario_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuario"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categoria_nome_tipo_uq" ON "categoria_financeira" USING btree (lower("nome"),"tipo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lanc_vencimento_idx" ON "lancamento" USING btree ("situacao","vencimento");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lanc_pago_idx" ON "lancamento" USING btree ("pago_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lanc_competencia_idx" ON "lancamento" USING btree ("competencia");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lanc_mensalidade_uq" ON "lancamento" USING btree ("contrato_id","competencia") WHERE origem = 'mensalidade';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lanc_setup_uq" ON "lancamento" USING btree ("contrato_id") WHERE origem = 'setup';