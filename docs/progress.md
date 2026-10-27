# Progresso

Legenda: ✅ implementado e testado · 🧪 implementado, teste parcial · ⛔ bloqueado (dependência externa) · ⏳ não iniciado

| Item | Situação | Evidência |
|---|---|---|
| Fundação F1–F5 | ✅ | `server/test/fundacao.test.ts`, `/saude` e `x-request-id` verificados via curl |
| CRM C1 | ✅ | `client/e2e/jornada-crm.cjs`: 9 passos no navegador, incluindo recarga e celular |
| CRM C2–C7 | ✅ | `server/test/integridade.test.ts`, `server/test/crm.test.ts` |
| CRM C8 | ✅ | `crm.test.ts` (indicadores), fórmulas em `docs/INDICADORES.md` |
| Financeiro R1–R7 | ✅ | `server/test/financeiro.test.ts` (7 cenários) e `client/e2e/jornada-financeiro.cjs` (6 passos no navegador) |
| Automações A1–A6 | ⏳ | fila `evento` já alimentada pelo CRM |
| Agente de IA I1–I5 | ⛔ parcial | estrutura pode ser feita. Respostas reais exigem `ANTHROPIC_API_KEY` |
| Deploy (Docker, backup e restauração testados) | ⏳ | — |

## Últimas verificações executadas (27/10/2026)
- `server`: `npm test` passou (27 testes: fundação, CRM, integridade e financeiro) e `tsc --noEmit` ok.
- E2E `jornada-financeiro.cjs`: 6/6 (despesa → baixa com diferença → painel → rastreio → geração idempotente → operador bloqueado).
- Navegação da Administração conferida no navegador após correção dos links relativos.
- Migrações 0002 (empresa nome+cidade) e 0003 (financeiro, com 7 restrições CHECK) aplicadas no banco de desenvolvimento.
- `client`: `tsc -b` ok, `vite build` ok, `oxlint` sem erros.
- E2E `jornada-crm.cjs` contra servidor local: 9/9 passos (repetido em 27/10).
- Migração 0001 aplicada no banco de desenvolvimento existente. A verificação prévia detectou um nome
  duplicado real (gerado por teste), que foi renomeado, não apagado.

## Limitações conhecidas
- Indicadores do painel não têm link para a lista filtrada de oportunidades (só para o pipeline geral).
- Sem paginação no quadro do pipeline (limite de 500 oportunidades abertas carregadas).
- Backup/restauração ainda não implementados. **Não usar com dados reais antes da etapa 6.**
- Geração de cobranças é manual (botão por mês). Automatizar no dia 1 entra na etapa 4 (automações).
- Painel financeiro não tem gráfico de linha. As barras mês a mês são clicáveis.
- Sem conciliação bancária nem emissão de boleto/NF (fora do escopo atual).

## Próximo passo
Etapa 4, automações: A1–A7 (gatilho → condição → ação, follow-up com parada, webhooks HMAC, origens de captação), consumindo a fila `evento`.
