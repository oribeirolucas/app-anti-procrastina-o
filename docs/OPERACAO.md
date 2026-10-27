# Operação e diagnóstico

## Saúde
- `GET /saude`: `200 {"ok":true,"banco":"ok"}`. `503` = banco inacessível (exige intervenção: verifique o container do Postgres e `DATABASE_URL`).

## Logs
JSON por linha na saída padrão. Campos: `t`, `nivel` (info|aviso|erro), `evento`, `reqId`.
Toda resposta HTTP traz `x-request-id`. Para rastrear um erro relatado: peça o horário e procure o `reqId` no log.

| evento | significado | ação |
|---|---|---|
| `http` (status ≥ 500) | falha interna | ver `trpc.erro_interno` com o mesmo `reqId` |
| `trpc.erro_interno` | exceção não tratada (traz um trecho da stack) | corrigir o código. O usuário vê só a mensagem genérica |
| `login.falhou` | senha errada (só o IP é registrado) | muitos seguidos do mesmo IP podem indicar ataque. O bloqueio é automático |
| `saude.banco_indisponivel` | Postgres fora | reiniciar o banco e verificar o disco |

## Automações
- A fila fica na tabela `evento`. Situações: `pendente`, `processado`, `falhou`.
- Quando roda: após cada alteração (no próprio pedido), a cada `WORKER_INTERVALO_S` segundos no servidor Node (VPS),
  e por `POST /tarefas/processar` com `Authorization: Bearer <CRON_SECRET>` (agendador externo). Também pelo botão "Processar agora".
- Erro numa automação: até 5 tentativas com espera de 1, 4, 9 e 16 min. Depois disso o evento fica `falhou` e aparece em
  Automações → Execuções e falhas, com o erro. Corrija a causa e clique em "Reprocessar". Ações já executadas não se repetem.
- Logs: `automacao.evento_erro` (vai tentar de novo), `automacao.evento_falhou` (exige intervenção), `webhook.assinatura_invalida`, `formulario.robo`.

## Erros mais prováveis
| Sintoma | Causa provável | Como resolver |
|---|---|---|
| "Este registro foi alterado por outra pessoa" | duas edições simultâneas | recarregar a página e refazer. É o comportamento esperado |
| "Origem não permitida" (403) | `ORIGEM_APP` diferente do domínio usado | ajustar `ORIGEM_APP` no `.env` |
| Migração aborta com "duplicado" | dados violam unicidade nova | resolver os duplicados citados e rodar `npm run db:migrate` de novo |
| Login sempre falha após várias tentativas | bloqueio de 15 min | aguardar ou limpar `tentativa_login` daquele e-mail |
| Todos bloqueados no login ao mesmo tempo | proxy na frente sem `TRUST_PROXY=1` (todos parecem o mesmo IP) | definir `TRUST_PROXY=1` quando houver proxy confiável |
| Webhook responde 401 | assinatura calculada com segredo antigo ou sobre corpo diferente | HMAC-SHA256 do corpo **exato** enviado, com o segredo atual |
| Formulário do site responde 403 | domínio do site diferente do cadastrado na origem | ajustar o domínio na origem de captação |

## Migrações
1. Backup antes (procedimento será documentado na etapa 6).
2. `npm run db:migrate`: cada migração roda em transação. Se falhar, nada é aplicado.
3. Reverter a aplicação = voltar a imagem/commit anterior. **Migrações não têm reversão automática.**
   Colunas novas são compatíveis com a versão anterior do código. Restrições novas podem exigir restaurar o backup.
