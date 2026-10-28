# Oferta da Recepção IA: o que cada plano entrega

> **Fonte única da verdade.** Agentes de venda, marketing (anúncios, vídeos, posts), site e CS usam esta definição.
> No sistema ela fica em **Administração → Planos e preços** (lista de entregas por plano) e em `empresa/perfil-crm.json`.
> Mudou aqui → muda no perfil → aplica (`deploy/scripts/aplicar-perfil.mjs`) → todos os agentes passam a falar igual.

## Marca
- **Larc Company** é a empresa. **Recepção IA** é o produto que ela vende.
- O site e as redes falam da solução e dos resultados para a clínica. Não precisam dizer que a empresa é operada por agentes de IA.
- **Regra fixa:** se alguém perguntar sinceramente se está falando com uma IA, o agente **não nega**. Ele se apresenta como "assistente virtual da Larc Company" e oferece passar para uma pessoa.
  - Fingir ser humano quebra a confiança, contraria a política da Meta para o WhatsApp Business e expõe a empresa ao Código de Defesa do Consumidor.
  - Vender IA e fingir não ser IA também é um péssimo argumento de venda.

## A lógica dos 3 planos
O cliente escolhe por **resultado**, não por funcionalidade:

| | **Essencial** | **Pro** | **Rede** |
|---|---|---|---|
| Promessa | "Nenhum paciente sem resposta" | "Mais pacientes na cadeira" | "Todas as unidades no mesmo padrão" |
| Resolve | Demora e perda de contato | Falta e paciente que some | Escala e controle |
| Para quem | 1 unidade, até ~300 conversas/mês | 1 unidade com agenda cheia e muitas faltas | 2 ou mais unidades ou alto volume |
| Mensal | R$ 297 | R$ 597 | R$ 897 |
| Setup (isento no anual) | R$ 497 | R$ 497 | R$ 497 |

## O que cada um recebe

Legenda: ✅ já entregamos hoje · 🔜 em construção, **não pode ser vendido nem prometido** até virar ✅.

### Essencial: R$ 297/mês
| Entrega | Status |
|---|---|
| Recepcionista virtual 24h no WhatsApp oficial da clínica (API oficial da Meta, na conta da clínica) | ✅ |
| Responde em segundos sobre procedimentos, valores, horários, endereço e formas de pagamento, só com as informações que a clínica aprovou | ✅ |
| Entende áudio (o paciente pode mandar áudio) | ✅ |
| Qualifica o interesse (procedimento, melhor dia e horário) e entrega o contato pronto para a recepção agendar | ✅ |
| Passa para um humano quando o paciente pede ou quando o assunto sai do roteiro | ✅ |
| Painel para a clínica acompanhar todas as conversas | ✅ |
| Até **300 conversas por mês** | ✅ |
| Implantação em até 72h com bateria de testes | ✅ |
| 1 ajuste de conteúdo por mês (preços, procedimentos e horários) | ✅ |
| Suporte por WhatsApp em horário comercial | ✅ |

### Pro: R$ 597/mês (âncora)
Tudo do Essencial, mais:
| Entrega | Status |
|---|---|
| Até **800 conversas por mês** | ✅ |
| Ajustes de conteúdo ilimitados (aplicados em até 1 dia útil) | ✅ |
| Relatório mensal de resultados: conversas, atendimentos fora do horário, novos contatos, confirmações, faltas e reativados | ✅ |
| Retomada automática de quem perguntou e não agendou (até 2 mensagens, respeitando quem pede para parar) | ✅ |
| Confirmação de consultas no dia anterior, contra faltas (agenda importada por planilha ou cadastrada) | ✅ |
| Campanha mensal de reativação de pacientes inativos (lista enviada pela clínica; disparo só após aprovação) | ✅ |

### Rede: R$ 897/mês
Tudo do Pro, mais:
| Entrega | Status |
|---|---|
| Até **3 unidades ou números** de WhatsApp, cada um com suas informações | 🔜 |
| Até **2.000 conversas por mês** no total | ✅ |
| Relatório semanal por unidade | 🔜 |
| Reunião mensal de resultados (30 min, com o fundador) | ✅ |
| Suporte prioritário: resposta em até 2h úteis | ✅ |

### Para todos os planos
- **Garantia de 30 dias:** se a clínica não ficar satisfeita no primeiro mês, devolvemos a mensalidade desse mês.
- Conversa acima da franquia: avisamos em 80% e em 100% e oferecemos o upgrade. Nunca cortamos o atendimento sem avisar.
- Sem fidelidade no plano mensal. O plano anual isenta o setup.
- **Desconto:** os agentes podem oferecer até **10%** sem aprovação. Acima disso, a decisão é do fundador (Aprovações).

## Situação de liberação
- **Essencial e Pro: liberados para venda** (28/10/2026). Requisito da implantação do Pro: modelos de mensagem aprovados pela Meta na conta da clínica (confirmação, retomada e reativação), em algumas horas a poucos dias.
- **Rede: ainda não.** Faltam multiunidade (até 3 números) e relatório semanal por unidade. Até lá, clínica com 2 ou mais unidades vai para o fundador (contrato sob medida).
- Integração direta com Google Agenda: ainda não existe; a agenda entra por planilha ou cadastro no painel.

### Próximos passos (Rede)
1. Multiunidade: vários números de WhatsApp na mesma instalação, cada um com suas informações e agenda.
2. Relatório semanal por unidade.

## Como cada time usa esta oferta
| Time (agentes) | Usa para |
|---|---|
| Marketing | Anúncios, roteiros de vídeo e posts **só com entregas ✅**. Uma dor e uma promessa por peça |
| SDR | Indicar o plano pelo volume de conversas e pelo número de unidades |
| Closer | Comparar planos, fazer a conta de retorno e contornar objeções. Desconto de até 10% |
| CS | Saber o que o cliente contratou e quando oferecer upgrade (franquia acima de 80%, 2ª unidade) |
| Site | Página de planos gerada da mesma fonte (endpoint público `/publico/oferta`) |
