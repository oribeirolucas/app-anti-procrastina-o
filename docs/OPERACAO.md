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

## Erros mais prováveis
| Sintoma | Causa provável | Como resolver |
|---|---|---|
| "Este registro foi alterado por outra pessoa" | duas edições simultâneas | recarregar a página e refazer. É o comportamento esperado |
| "Origem não permitida" (403) | `ORIGEM_APP` diferente do domínio usado | ajustar `ORIGEM_APP` no `.env` |
| Migração aborta com "duplicado" | dados violam unicidade nova | resolver os duplicados citados e rodar `npm run db:migrate` de novo |
| Login sempre falha após várias tentativas | bloqueio de 15 min | aguardar ou limpar `tentativa_login` daquele e-mail |

## Migrações
1. Backup antes (procedimento será documentado na etapa 6).
2. `npm run db:migrate`: cada migração roda em transação. Se falhar, nada é aplicado.
3. Reverter a aplicação = voltar a imagem/commit anterior. **Migrações não têm reversão automática.**
   Colunas novas são compatíveis com a versão anterior do código. Restrições novas podem exigir restaurar o backup.
