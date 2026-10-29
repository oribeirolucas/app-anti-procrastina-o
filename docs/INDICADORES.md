# Fórmulas dos indicadores

Valores monetários são somados em centavos inteiros (`server/src/lib/dinheiro.ts`). O período usa
o fuso configurado (padrão America/Sao_Paulo): "de" começa às 00:00 e "até" vai até 23:59:59.

## Comercial (Painel)

| Indicador | Fórmula | Observação |
|---|---|---|
| Pipeline aberto | Σ valor das oportunidades com situação `aberta` | foto atual, ignora o período |
| Pipeline ponderado | Σ (valor × probabilidade da etapa ÷ 100) | estimativa, **não é receita** |
| Vendas no período | Σ valor das oportunidades que entraram em etapa `ganha` com `fechada_em` no período | é MRR vendido, não dinheiro recebido |
| Ganhas / perdidas | contagem por `fechada_em` dentro do período | |
| Taxa de conversão | ganhas ÷ (ganhas + perdidas) no período | "—" se não houve decisões |
| Ticket médio | vendas no período ÷ ganhas no período | |
| Novas oportunidades | contagem por `criado_em` no período | |
| Tarefas atrasadas | tarefas não concluídas com `vence_em` ≤ agora | |
| MRR contratado | Σ `valor_mensal` dos contratos com situação `ativo` | é compromisso contratado, não faturado nem recebido |

## Hierarquia de valores (não misturar)

1. **Oportunidade**: potencial, nunca entra no financeiro.
2. **Contrato (vendido)**: compromisso de pagamento recorrente.
3. **Faturado (etapa 3)**: conta a receber emitida.
4. **Recebido (etapa 3)**: dinheiro que efetivamente entrou (data de recebimento).

## Financeiro (Financeiro → Painel)

Lançamentos cancelados nunca entram em nenhum total. Somas em `numeric` no banco, exibidas com 2 casas.
Cada número no painel é um link para a lista de lançamentos com os mesmos filtros (rastreabilidade).

| Indicador | Fórmula | Filtro equivalente na lista |
|---|---|---|
| Vendido (MRR ativo) | Σ `valor_mensal` dos contratos `ativo` (foto atual, ignora o período) | tela Contratos |
| Faturado | Σ `valor` das receitas não canceladas com competência no período | tipo=receita, não canceladas, data por competência |
| Recebido | Σ `valor_pago` das receitas pagas com `pago_em` no período | tipo=receita, pagas, data por pagamento |
| Despesas pagas | Σ `valor_pago` das despesas pagas com `pago_em` no período | tipo=despesa, pagas, data por pagamento |
| Saldo realizado | recebido − despesas pagas | — |
| Previsto (receitas/despesas) | Σ `valor` dos não cancelados com vencimento no período (pagos ou não) | não canceladas, data por vencimento |
| Saldo previsto | previsto receitas − previsto despesas | — |
| Em atraso | Σ `valor` dos pendentes com vencimento antes de hoje (foto atual) | situação = em atraso |
| Previsto − realizado (receitas) | previsto receitas − recebido | — |
| Fluxo mês a mês | as mesmas fórmulas, agrupadas por mês do vencimento (previsto) e do pagamento (realizado) | clique em cada barra |

**Geração de cobranças (mês M):** para cada contrato `ativo` com início ≤ último dia de M e (sem fim ou fim ≥ dia 1 de M),
cria a mensalidade (vencimento = dia de cobrança, limitado ao último dia do mês) e, se o início cai em M e o setup > 0,
o setup. Os índices únicos `lanc_mensalidade_uq` (contrato + competência) e `lanc_setup_uq` (contrato) impedem duplicidade.

## Contratos (aba Contratos)

| Indicador | Fórmula |
|---|---|
| Receita mensal ativa | Σ `valor_mensal` dos contratos `ativo` |
| Vencendo em 30 dias | contratos `ativo` com `fim` entre hoje e hoje + 30 (vencidos = `fim` < hoje) |
| Inadimplência | Σ `valor` das cobranças de contrato `pendente` com vencimento antes de hoje |
| Cancelados no mês | contratos com `cancelado_em` a partir do dia 1 do mês atual. Receita perdida = Σ `valor_mensal` deles |
| Vendas sem contrato | oportunidades `ganha`, não arquivadas, sem contrato com `oportunidade_id` apontando para elas |
| Por contrato | faturado = Σ cobranças não canceladas · recebido = Σ `valor_pago` pagas · em atraso = pendentes vencidas |

## Marketing (aquisição)

| Indicador | Fórmula |
|---|---|
| Investimento | Σ `valor_pago` das despesas **pagas** na categoria "Marketing", com `pago_em` no período |
| Leads | oportunidades criadas no período (por origem) |
| Novos clientes | empresas distintas com contrato de `inicio` no período |
| CPL | investimento ÷ leads (— quando não há leads) |
| CAC | investimento ÷ novos clientes (— quando não há novos clientes) |
| Gasto médio diário | investimento ÷ dias do período. Comparado ao orçamento diário configurado |

## Customer Success (health score)

Calculado por regras auditáveis, para cada empresa com contrato `ativo`. Começa em 100 e desconta:

| Sinal | Desconto |
|---|---|
| Cobrança de receita pendente com vencimento antes de hoje | −30 |
| Último contato (interação que não seja "alteração") há mais de 60 dias | −35 |
| Último contato há 31–60 dias, ou nenhum contato registrado | −20 |
| Tarefa da empresa não concluída e vencida | −15 |
| Contrato termina em até 30 dias (ou já venceu) | −15 |

Risco: alto < 50 ≤ médio < 75 ≤ baixo. MRR em risco = Σ MRR dos clientes de risco alto.
