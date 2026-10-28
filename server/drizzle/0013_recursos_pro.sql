CREATE TABLE "agendamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contato_id" uuid,
	"nome" varchar(200) NOT NULL,
	"telefone" varchar(20) NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"procedimento" varchar(120),
	"profissional" varchar(120),
	"situacao" varchar(12) DEFAULT 'agendado' NOT NULL,
	"lembrete_enviado_em" timestamp with time zone,
	"resposta_em" timestamp with time zone,
	"erro_lembrete" varchar(300),
	"id_externo" varchar(120),
	"origem" varchar(10) DEFAULT 'manual' NOT NULL,
	"observacao" varchar(300),
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agendamento_situacao_ck" CHECK ("agendamento"."situacao" in ('agendado','confirmado','cancelado','remarcar','sem_resposta','compareceu','faltou'))
);
--> statement-breakpoint
CREATE TABLE "campanha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" varchar(120) NOT NULL,
	"modelo" varchar(120) NOT NULL,
	"situacao" varchar(22) DEFAULT 'rascunho' NOT NULL,
	"solicitacao_id" uuid,
	"limite_por_ciclo" integer DEFAULT 30 NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campanha_situacao_ck" CHECK ("campanha"."situacao" in ('rascunho','aguardando_aprovacao','aprovada','enviando','concluida','recusada','cancelada'))
);
--> statement-breakpoint
CREATE TABLE "campanha_destinatario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campanha_id" uuid NOT NULL,
	"nome" varchar(200) NOT NULL,
	"telefone" varchar(20) NOT NULL,
	"situacao" varchar(10) DEFAULT 'pendente' NOT NULL,
	"motivo" varchar(300),
	"enviado_em" timestamp with time zone,
	"respondeu_em" timestamp with time zone,
	CONSTRAINT "camp_dest_situacao_ck" CHECK ("campanha_destinatario"."situacao" in ('pendente','enviado','falhou','pulado'))
);
--> statement-breakpoint
CREATE TABLE "retomada" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversa_id" uuid NOT NULL,
	"mensagem_ref_id" uuid NOT NULL,
	"passo" integer NOT NULL,
	"situacao" varchar(10) NOT NULL,
	"erro" varchar(300),
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retomada_situacao_ck" CHECK ("retomada"."situacao" in ('enviada','falhou'))
);
--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN "origem" varchar(12) DEFAULT 'atendimento' NOT NULL;--> statement-breakpoint
ALTER TABLE "agendamento" ADD CONSTRAINT "agendamento_contato_id_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contato"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanha" ADD CONSTRAINT "campanha_solicitacao_id_solicitacao_aprovacao_id_fk" FOREIGN KEY ("solicitacao_id") REFERENCES "public"."solicitacao_aprovacao"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campanha_destinatario" ADD CONSTRAINT "campanha_destinatario_campanha_id_campanha_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."campanha"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retomada" ADD CONSTRAINT "retomada_conversa_id_conversa_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversa"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agendamento_inicio_idx" ON "agendamento" USING btree ("inicio");--> statement-breakpoint
CREATE INDEX "agendamento_telefone_idx" ON "agendamento" USING btree ("telefone","inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "agendamento_externo_uq" ON "agendamento" USING btree ("id_externo") WHERE id_externo is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "camp_dest_uq" ON "campanha_destinatario" USING btree ("campanha_id","telefone");--> statement-breakpoint
CREATE INDEX "camp_dest_fila_idx" ON "campanha_destinatario" USING btree ("campanha_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "retomada_uq" ON "retomada" USING btree ("conversa_id","mensagem_ref_id","passo");