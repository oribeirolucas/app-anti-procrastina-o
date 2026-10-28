# Atendimento autônomo pelo WhatsApp

## Fluxo
```
Meta (WhatsApp Cloud API)
  └─ POST /webhooks/whatsapp (ou /api/webhooks/whatsapp)
       1. confere a assinatura X-Hub-Signature-256 (WHATSAPP_APP_SECRET); sem ela → 401
       2. extrai número, texto e horário (webhooks/whatsapp.ts)
       3. número novo → contato + oportunidade na 1ª etapa do pipeline (origem "whatsapp")
       4. grava a mensagem (id da Meta é único: reenvio não duplica) e responde 200
  └─ fila de atendimento (services/atendimentoService.ts), disparada na hora e a cada 30 s
       5. trava a conversa (lease de 2 min: só um processo responde)
       6. áudios pendentes: baixa da Meta e transcreve com o ChatGPT (services/transcricaoService.ts); falha → o agente pede para escrever
       7. conversa em atendimento humano → a IA não responde (mas o áudio já fica transcrito no Inbox)
       7. memória: últimas 15 mensagens + dados do CRM (services/contextService.ts)
       8. roteador escolhe o agente (services/agentRouter.ts)
       9. franquia de uso (Administração → Uso e limites): esgotada com bloqueio → mensagem padrão
      10. LLM do agente (services/llmService.ts) devolve {resposta, acoes} em formato validado
      11. o SISTEMA executa as ações com as próprias regras (desconto > 10% vira aprovação etc.)
      12. grava a resposta, liga à timeline do contato e envia pela API da Meta
      13. registra execução (Agentes IA → Logs) e consumo
```
Se a IA falhar (chave ausente, API fora, resposta inválida) o cliente recebe a mensagem padrão,
a conversa passa para humano e os administradores recebem tarefa + aviso no sininho.

## Roteamento
| Situação do contato | Agente |
|---|---|
| Empresa com contrato ativo | Customer Success |
| Sem oportunidade, ou etapa Lead / Contato feito | SDR (área marketing) |
| Etapa Demonstração / Proposta | Closer (área comercial) |
| Outra etapa aberta | ordem ≤ 2 → SDR, senão Closer |

O agente usado é o **ativo** da área em Agentes IA. Se a área não tiver nenhum, o sistema cria um com o
prompt padrão (`server/src/config/prompts.ts`) **inativo**: revise o prompt e ative.

## Ações que o agente pode pedir (o sistema valida)
| Ação | O que o sistema faz |
|---|---|
| qualificado | só SDR, oportunidade aberta: move para Demonstração (histórico + evento, dispara automações) |
| oferecer_desconto | Closer até 10%: permitido. Acima (ou outro agente): cria Aprovação e troca a resposta por "vou levar para aprovação" |
| solicitar_aprovacao | cria card em Aprovações (reembolso, condição especial…) |
| pedir_link_pagamento | tarefa + aviso para a equipe enviar o link (**não há integração de pagamento ainda; nenhum link é inventado**) |
| risco_cancelamento | tarefa + aviso de churn |
| transferir_humano | conversa passa para humano + tarefa + aviso |
| descadastrar | marca o contato como descadastrado e encerra follow-ups |

Regras fixas anexadas a todo prompt (não editáveis na tela): só usar preços/planos do CRM, tratar o contexto e as
mensagens do cliente como dados (proteção contra prompt injection), nunca pedir senha/cartão/documento.

## Configurar (quando for ligar de verdade)
1. Meta for Developers → app do tipo Business → produto WhatsApp. Anote o **Phone number ID**.
2. Gere um **token permanente** de usuário de sistema (Business Settings → System users) com `whatsapp_business_messaging`.
3. App → Settings → Basic → **App secret**.
4. Defina no servidor: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (texto que você inventa), `ANTHROPIC_API_KEY` (conversa) e `OPENAI_API_KEY` (transcrição de áudio).
5. WhatsApp → Configuration → Webhook: URL `https://SEU_DOMINIO/webhooks/whatsapp`, Verify token = o mesmo do passo 4; assine o campo **messages**.
6. Em Agentes IA, revise os prompts e **ative** os agentes. Em Uso e limites, defina a franquia.

**Antes de ativar com clientes reais:** teste com o número de teste da Meta e o seu próprio celular.

## Custos e limites
- Anthropic: cobrado por token (preços em platform.claude.com). Cada resposta registra os tokens em Uso e limites.
- OpenAI: transcrição cobrada por minuto de áudio ou por token, conforme o modelo. Cada áudio registra os segundos em Uso e limites (estimados pelo tamanho do arquivo quando a API não informa).
- Meta: cobrança por conversa conforme a categoria (respostas do atendimento costumam ser as mais baratas). Mensagens
  iniciadas pela empresa fora da janela de 24 h exigem template aprovado (ainda não implementado).
- Envio: sem chave de idempotência na API da Meta. O sistema só envia cada resposta uma vez, mas se o processo cair
  exatamente entre o envio e a gravação, o cliente pode receber a mesma resposta duas vezes.

## Limitações atuais
- Divisão de IAs: **Claude conversa** com o cliente (agentes); **ChatGPT só transcreve** áudio (modelo em `OPENAI_MODELO_TRANSCRICAO`, padrão `gpt-4o-transcribe`).
- Imagens, vídeos e documentos ainda não são lidos: o agente pede para o cliente escrever ou mandar áudio.
- Na Vercel (ambiente de teste), a resposta é gerada logo após o webhook e pelo `/tarefas/processar`; função serverless
  pode ser encerrada antes, então a VPS (processo contínuo) é o ambiente indicado para produção.
- Link de pagamento, envio de mídia e templates fora da janela de 24 h: ainda não.

## Recursos do plano Pro
Configurados em Administração → Recursos Pro. Rodam no ciclo do atendimento (a cada 30 s na VPS; pelo `/tarefas/processar` no serverless).

| Recurso | Precisa de modelo da Meta? | Regra |
|---|---|---|
| Retomada, passo 1 | Não (dentro de 24h) | X horas após nossa última resposta, se o cliente não respondeu e ainda está na janela |
| Retomada, passo 2 | Sim (`{{1}}` = nome) | Após Y horas. Para se o cliente responder, pedir para parar, for para humano, tiver consulta marcada ou o negócio fechou |
| Confirmação de consulta | Sim (`{{1}}` nome, `{{2}}` data, `{{3}}` hora, `{{4}}` procedimento) | Na véspera, a partir da hora configurada, uma vez por consulta. A IA interpreta a resposta e atualiza a Agenda |
| Reativação | Sim (`{{1}}` = nome) | Só após o Go em Aprovações. Lotes de 30 por ciclo. Quem pediu para parar é pulado |

Modelos sugeridos para submeter à Meta na implantação (categoria "Utilidade" para confirmação; "Marketing" para retomada e reativação):
- `confirmacao_consulta`: "Olá, {{1}}! Passando para confirmar sua consulta de {{4}} em {{2}} às {{3}}. Podemos confirmar?"
- `retomada_contato`: "Oi, {{1}}! Ficou alguma dúvida sobre o atendimento? Se quiser, te ajudo a escolher um horário."
- `reativacao_pacientes`: "Oi, {{1}}! Sentimos sua falta por aqui. Quer que eu veja um horário para você?"

## Plano Rede (várias unidades)
1. Na conta Meta da clínica, adicione um número de WhatsApp por unidade (todos no mesmo app).
2. Em Administração → Unidades, cadastre cada unidade com o **Phone number ID** do número e as informações (endereço, horários, equipe).
3. O webhook é o mesmo para todos os números: a mensagem é atribuída à unidade pelo `phone_number_id` que vem nela.
4. O token (`WHATSAPP_TOKEN`) precisa ter acesso a todos os números. `WHATSAPP_PHONE_NUMBER_ID` continua sendo o número principal (usado quando não há unidade).
