# Recepção IA — empresa operada por agentes

> Nome provisório. Meta: **R$ 50 mil/mês de receita recorrente (MRR)**.

## 1. A decisão (para debatermos)

**Produto:** uma *recepcionista de IA no WhatsApp* para clínicas (estética, odontologia, fisioterapia, psicologia). Ela responde em segundos, 24/7, tira dúvidas de preço/procedimento, agenda, confirma consultas e reativa pacientes sumidos.

**Por que esse e não outro:**

| Critério | Recepção IA (escolhido) | Infoproduto/curso | Agência de tráfego |
|---|---|---|---|
| Receita | Recorrente (MRR) | Picos de lançamento | Recorrente, mas teto por pessoa |
| Dor do cliente | Aguda e mensurável (lead perdido, no-show) | Difusa | Média |
| Prova de ROI | 1 consulta recuperada já paga o mês | Difícil | Depende do ROAS |
| Entrega automatizável por agentes | Alta (n8n + WhatsApp API + Claude) | Alta | Baixa (operação manual) |
| Concorrência no nicho | Média e fragmentada | Saturada | Saturada |
| Tempo até 1ª receita | 2–3 semanas | 4–8 semanas | 1–2 semanas |

**Tese de ROI vendida ao cliente:** uma clínica média perde 30–40% dos leads do WhatsApp por demora na resposta e tem 15–25% de no-show. Se a IA recupera **2 consultas/mês de R$ 250**, o plano de R$ 397 já se pagou.

## 2. Oferta e preço

| Plano | Mensal | Inclui |
|---|---|---|
| Essencial | R$ 297 | Atendimento 24/7, FAQ, captura de lead, transbordo humano |
| Pro (âncora de venda) | R$ 497 | + agendamento integrado (Google Agenda), confirmação anti no-show, reativação mensal |
| Rede (2+ unidades) | R$ 897 | + multiunidade, relatório semanal, gerente de conta |
| Setup (todos) | R$ 497 único | Implantação em 72h; isento no plano anual |

Garantia: 30 dias ou devolvemos o mês. Upsell: campanha de reativação de base (R$ 297 avulso).

## 3. Unit economics (premissas — validar nos primeiros 30 clientes)

| Métrica | Valor |
|---|---|
| Ticket médio (mix) | R$ 400 |
| Custo variável/cliente (WhatsApp API + IA + infra) | ~R$ 110 |
| Margem bruta | ~72% |
| Churn mensal alvo | ≤ 4% → vida média 25 meses |
| LTV (margem) | ~R$ 7.200 |
| CAC alvo | ≤ R$ 900 (payback ~3 meses) |
| LTV/CAC | ≥ 8x |
| **Clientes para R$ 50k MRR** | **125** |

## 4. Rota até R$ 50k

| Mês | Clientes ativos | MRR | Setups | Receita do mês | Canal principal |
|---|---|---|---|---|---|
| 1 | 8 | 3,2k | 4,0k | 7,2k | Outbound (SDR) + rede pessoal |
| 2 | 22 | 8,8k | 7,0k | 15,8k | Outbound + Meta Ads |
| 3 | 40 | 16k | 9,0k | 25k | Meta Ads + indicações |
| 4 | 62 | 24,8k | 11k | 35,8k | Escala Ads + parceiros |
| 5 | 90 | 36k | 14k | 50k ✅ (receita bruta) | |
| 6–7 | 125+ | 50k+ ✅ (MRR) | | | |

Funil necessário em regime (mês 5): ~35 vendas/mês ← ~90 demos realizadas ← ~140 agendadas ← ~700 leads qualificados. Meta Ads a CPL R$ 15 → ~R$ 10k/mês de mídia; CAC ≈ R$ 290 de mídia + custo de agentes.

## 5. Organização

Ver [OPERACAO.md](OPERACAO.md) (setores, fluxos, rotinas, KPIs) e [agentes/](agentes/) (os prompts de cada agente). O código para colocá-los para operar está em [runtime/](runtime/).

## 6. O que precisa de você (humano no loop)

- Aprovar orçamento de mídia e qualquer gasto > R$ 500.
- Fazer as demos/fechamentos nas primeiras 4 semanas (o agente Closer prepara tudo; depois ele assume o roteiro por WhatsApp + você só nos contas grandes).
- Fase de validação no **CPF**: gateway (Asaas/Kiwify aceitam CPF), Meta Business como pessoa física, e o WhatsApp de cada clínica conectado na conta Meta da própria clínica. Abrir CNPJ quando bater o primeiro gatilho: ~R$6k/mês recorrente, 15 clientes, ou cliente exigindo nota fiscal.

## 7. Pontos em aberto para debate

1. **Nicho de entrada:** estética (ticket alto, decisão rápida) vs. odontologia (mais clínicas). Recomendo estética.
2. **Preço:** R$ 397 médio é agressivo-baixo para o valor; podemos testar R$ 597 no Pro desde o início.
3. **Build vs. white-label:** construir a recepcionista em n8n + Claude (margem maior) vs. revender plataforma pronta (lançamento mais rápido). Recomendo construir — o prompt do produto já está em `agentes/02-produto-recepcionista.md`.
4. **Modelo de IA por agente:** todos configurados no Claude Opus 5.5. Para o atendimento de alto volume dá para baixar custo com modelos menores — decisão sua após medir qualidade.
