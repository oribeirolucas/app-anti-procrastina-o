# Próximo nível: agentes de venda com voz

## Arquitetura
```
Lead (anúncio, formulário, WhatsApp, lista B2B)
   │
   ├─ WhatsApp texto/áudio ─► n8n ─► STT (áudio→texto) ─► Claude (Agente 12) ─► TTS (texto→áudio) ─► WhatsApp
   │
   └─ Ligação ─► Plataforma de voz (Vapi / Retell / ElevenLabs Agents) + número BR (SIP/Twilio)
                    └─ LLM: Claude (Agente 12) · voz pt-BR clonada/premium · webhooks ─► n8n ─► CRM/Asaas
```

| Camada | Opção recomendada | Custo estimado |
|---|---|---|
| Voz em tempo real (ligações) | Vapi ou Retell (aceitam Claude como cérebro) | ~US$0,10–0,15/min com tudo |
| Voz (TTS) pt-BR | ElevenLabs | incluso acima / ~US$5–22/mês para áudios do WhatsApp |
| Transcrição (STT) | Deepgram / ElevenLabs Scribe | centavos por minuto |
| Número de telefone BR | Twilio ou provedor SIP nacional | ~R$30–60/mês |
| Orquestração, CRM | n8n (já conectado) + Postgres | já existe |

**Custo por venda (estimativa):** 100 ligações × 3 min ≈ R$170 → ~35 atendidas → ~8 demos → ~3 vendas ≈ **R$60 de voz por cliente**. Cabe com folga no CAC de R$900.

## Fases (90 dias)
| Fase | Prazo | Entrega |
|---|---|---|
| 1 | Semana 1–2 | WhatsApp multimodal: entende e responde áudio, texto e imagem (n8n + Claude + STT/TTS) |
| 2 | Semana 3–4 | Ligações para leads quentes (quem pediu contato) + agendamento automático |
| 3 | Mês 2 | Ligação B2B ativa para clínicas da lista (com regras de compliance) + A/B de vozes e roteiros |
| 4 | Mês 3 | **Upsell no produto:** a recepcionista da clínica também atende o telefone (plano Voz, +R$300/mês) |

## Autonomia total: níveis de liberação
| Nível | O agente decide sozinho | Gatilho para subir |
|---|---|---|
| 1 (agora) | Conversa, agenda, envia link | — |
| 2 | Desconto até 20%, remarcações, follow-ups | 20 vendas com taxa de reembolso < 10% |
| 3 | Realocar verba de anúncio entre campanhas (sem aumentar o total) | 30 dias com CAC dentro da meta |
| 4 | Aumentar orçamento até +20%/semana se ROAS ≥ meta | 60 dias de caixa positivo |
Sempre com você: abrir CNPJ, contratos, saques e qualquer gasto fora dessas regras.
