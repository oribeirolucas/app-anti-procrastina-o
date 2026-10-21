# Operação — setores, agentes e fluxos

## Organograma

```
                         Fundador (humano) — aprova gastos, contratos, demos iniciais
                                      │
                         00 CEO / Orquestrador
     ┌──────────────┬───────────────┼───────────────┬──────────────────┐
  CRESCIMENTO      VENDAS        ENTREGA        RETENÇÃO          BACKOFFICE
  01 Inteligência  05 SDR        02 Produto     08 Suporte        10 Financeiro
  03 Conteúdo      06 Closer     07 Onboarding  09 Customer       11 Dados/BI
  04 Tráfego                                       Success
```

| # | Agente | Setor | KPI principal | Cadência |
|---|---|---|---|---|
| 00 | CEO / Orquestrador | Direção | MRR vs. plano | Diário + semanal |
| 01 | Inteligência de Mercado | Crescimento | Insights acionados/semana | Semanal |
| 02 | Produto — Recepcionista IA | Entrega | Taxa de agendamento das conversas | Contínuo (é o produto) |
| 03 | Conteúdo Orgânico | Marketing | Leads orgânicos/mês | Diário |
| 04 | Tráfego Pago (desligado) | Marketing | — | — |
| 12 | Vendedor de Voz | Vendas | Venda a cada ~57 ligações | Contínuo |
| 05 | SDR / Prospecção | Vendas | Demos agendadas/semana | Diário |
| 06 | Closer | Vendas | Taxa de fechamento ≥ 35% | Por demo |
| 07 | Onboarding | Entrega | Go-live ≤ 72h | Por cliente |
| 08 | Suporte | Retenção | 1ª resposta < 5 min, CSAT ≥ 4,6 | Contínuo |
| 09 | Customer Success | Retenção | Churn ≤ 4%, NRR ≥ 105% | Semanal |
| 10 | Financeiro | Backoffice | Inadimplência ≤ 3%, caixa | Diário |
| 11 | Dados / BI | Backoffice | Painel atualizado | Diário |

## Fluxo de receita (handoffs)

```
01 → insights → 03/04 → lead → 05 (qualifica: BANT simplificado) → demo agendada
→ 06 (proposta + checkout) → pagamento confirmado (10) → 07 (implanta 02 no WhatsApp da clínica)
→ go-live → 09 (D+7, D+30, mensal) ↔ 08 (tickets) → indicação/upsell → volta para 06
                 11 lê tudo e alimenta 00, que replaneja.
```

## Rotinas

| Quando | Quem | Entrega |
|---|---|---|
| 08:00 diário | 11 → 00 | Painel do dia + briefing com 3 prioridades por setor |
| 09:00 diário | 03, 04, 05 | Posts do dia, ajustes de campanha, 50 abordagens |
| Contínuo | 02, 08 | Atendimento de pacientes e de clientes |
| Por evento | 06, 07, 10 | Proposta, implantação, cobrança |
| Seg 10:00 | 00 + todos | Revisão semanal: plano vs. real, decisões, experimentos |
| Sex 16:00 | 09 | Health score, contas em risco, oportunidades de upsell |

## Regras de governança (valem para todos)

1. Nenhum agente gasta dinheiro, assina contrato, dá desconto > 20% ou envia mensagem em massa sem aprovação do fundador.
2. Toda saída termina com bloco `PRÓXIMAS AÇÕES` e `PRECISA DE APROVAÇÃO` (pode estar vazio).
3. Números sempre com fonte (planilha, CRM, gateway). Sem dado → declarar a suposição.
4. LGPD: dados de pacientes ficam só no ambiente da clínica; agentes internos veem métricas agregadas.
5. Memória compartilhada: `runtime/memoria/estado.md` (lida por todos, atualizada pelo 00).

## Stack

| Função | Ferramenta |
|---|---|
| Cérebro dos agentes | Claude API (`runtime/`) |
| Orquestração/automação | n8n (cron, webhooks, CRM, WhatsApp) |
| WhatsApp | WhatsApp Cloud API (Meta) |
| CRM | Planilha Google → depois HubSpot/Pipedrive |
| Checkout/assinatura | Asaas ou Stripe (recorrência + boleto/Pix) |
| Agenda | Google Calendar API |
| Landing page | Lovable/Vercel |

## Como os agentes rodam

- **Manual / teste:** `npm run agente -- 05 "Monte a lista de 50 clínicas de estética em Curitiba e as mensagens"`.
- **Rotina diária:** `npm run rotina` executa 11 → 00 → 03/04/05 e grava tudo em `runtime/saidas/AAAA-MM-DD/`.
- **Produção:** n8n chama o mesmo runner por cron (rotinas) ou webhook (lead novo, pagamento, ticket) e injeta os dados do evento na tarefa.
