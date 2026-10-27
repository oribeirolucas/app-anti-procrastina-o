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
