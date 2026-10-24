# Progresso

Legenda: ✅ implementado e testado · 🧪 implementado, teste parcial · ⛔ bloqueado (dependência externa) · ⏳ não iniciado

| Item | Situação | Evidência |
|---|---|---|
| Fundação F1–F5 | ✅ | `server/test/fundacao.test.ts`, `/saude` e `x-request-id` verificados via curl |
| CRM C1 | ✅ | `client/e2e/jornada-crm.cjs`: 9 passos no navegador, incluindo recarga e celular |
| CRM C2–C7 | ✅ | `server/test/integridade.test.ts`, `server/test/crm.test.ts` |
| CRM C8 | ✅ | `crm.test.ts` (indicadores), fórmulas em `docs/INDICADORES.md` |
| Financeiro R1–R5 | ⏳ | próximo incremento |
| Automações A1–A6 | ⏳ | fila `evento` já alimentada pelo CRM |
| Agente de IA I1–I5 | ⛔ parcial | estrutura pode ser feita. Respostas reais exigem `ANTHROPIC_API_KEY` |
| Deploy (Docker, backup e restauração testados) | ⏳ | — |

## Últimas verificações executadas (24/10/2026)
- `server`: `npm test` passou (20 testes: fundação, CRM e integridade) e `tsc --noEmit` ok.
- `client`: `tsc -b` ok, `vite build` ok, `oxlint` sem erros.
- E2E `jornada-crm.cjs` contra servidor local: 9/9 passos.
- Migração 0001 aplicada no banco de desenvolvimento existente. A verificação prévia detectou um nome
  duplicado real (gerado por teste), que foi renomeado, não apagado.

## Limitações conhecidas
- Indicadores do painel não têm link para a lista filtrada de oportunidades (só para o pipeline geral).
- Sem paginação no quadro do pipeline (limite de 500 oportunidades abertas carregadas).
- Backup/restauração ainda não implementados. **Não usar com dados reais antes da etapa 6.**
- Premissas P1–P4 em `requirements.md` aguardam confirmação do responsável.

## Próximo passo
Etapa 3, financeiro: R1 a R5 (lançamentos, contas a pagar e receber a partir de contratos, fluxo realizado × previsto).
