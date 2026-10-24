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
