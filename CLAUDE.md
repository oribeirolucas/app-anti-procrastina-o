# CLAUDE.md: instruções de desenvolvimento

Plataforma interna da Recepção IA (CRM, financeiro, automações, agente de IA). Monólito modular:
`server/` (Node 22 + tRPC + Drizzle + PostgreSQL) e `client/` (React + Vite + Tailwind).

## Antes de começar qualquer tarefa
1. Leia `docs/progress.md` (estado, bloqueios, próximo passo) e `docs/requirements.md` (critérios de aceite).
2. Confira `git status` e `git log -5`. Preserve mudanças que não forem suas.
3. Rode `cd server && npm test` para confirmar o estado real antes de mudar algo.

## Comandos
| O quê | Comando |
|---|---|
| Testes de backend (Postgres real, banco `*_test` recriado) | `cd server && npm test` |
| Tipos | `cd server && npm run typecheck` · `cd client && npx tsc -b` |
| Lint do front | `cd client && npm run lint` |
| Nova migração | editar `server/src/db/schema.ts` → `cd server && npx drizzle-kit generate --name <nome>` |
| Aplicar migrações | `cd server && npm run db:migrate` |
| Subir local | `cd server && npm run dev` + `cd client && npm run dev` |
| E2E no navegador | `cd client && BASE_URL=http://localhost:3000 E2E_EMAIL=… E2E_SENHA=… node e2e/jornada-<crm\|financeiro\|automacoes\|contratos>.cjs` (`FALHA_PNG=arquivo.png` salva a tela da falha) |
| Simular rede lenta | `RETARDO_MS=700 npm run dev` no server (só fora de produção): reproduz condições de corrida que só aparecem no link |

## Convenções (obrigatórias)
- **Permissão no backend**: todo procedimento usa `comPermissao("<permissao>")`. A matriz única
  está em `server/src/auth/permissoes.ts` e deve ficar espelhada em `docs/PERMISSOES.md`.
- **Dinheiro**: `numeric(14,2)` no banco, string no TS, somas em centavos (`lib/dinheiro.ts`). Nunca usar float.
- **Datas de período**: usar `lib/datas.ts` com o fuso configurado. Datas puras são `AAAA-MM-DD`.
- **Escritas múltiplas** (registro + histórico + evento) sempre em `db.transaction`. Passe `tx` para `emitirEvento`/`auditar`.
- **Edição** de empresa/contato/oportunidade exige `versao` (concorrência otimista). Conflito → `CONFLICT`.
- **Sem exclusão física** de empresa/contato/oportunidade: use arquivamento. Dados pessoais: `anonimizarContato`.
- **Unicidade** garantida por índice no banco. Mensagens amigáveis em `lib/integridade.ts`.
- **Logs**: `lib/log.ts` (JSON). Nunca logar senha, token, e-mail, telefone ou conteúdo de mensagem.
- **Migrações**: nunca editar migração já aplicada. Gere uma nova. Se criar restrição, inclua
  verificação prévia que aborte com mensagem clara (ver `drizzle/0001_*.sql`).
- **Testes**: não enfraquecer validação ou permissão para um teste passar. Corrija a causa.
- **Integrações externas**: nunca disparar mensagens reais em teste. Toda ação externa precisa de chave de idempotência.
- Textos da interface em pt-BR. Valores em R$. Datas dd/mm/aaaa.
- **Rotas aninhadas** (`/x/*`): links e `Navigate` com caminho absoluto (relativos geraram laço de redirecionamento).
- **Datas**: validar existência no servidor (`2025-06-31` precisa dar 400, não 500).
- **Financeiro**: lançamento não é excluído. Cancelamento exige motivo e pago precisa de estorno antes. Regras também como CHECK no banco.
- **Zod 4**: em objetos com campos que têm padrão, use `.prefault({})`, não `.default({})` (no v4 o `.default` não aplica os padrões internos).
- **Após mutação, use a resposta**: aplique a versão devolvida (`setData`) antes de recarregar, ou a próxima ação vai com versão antiga em rede lenta.
- **E2E**: espere pela confirmação (aviso ou item na lista), nunca pelo texto que você mesmo digitou (ele existe no próprio campo).
- Componentes de UI em `client/src/components/ui.tsx`. Avisos com `useAvisar()`. Estados de carregando/erro/vazio em toda lista.

## Arquitetura
Ver `ARCHITECTURE.md`. Indicadores: `docs/INDICADORES.md`. Operação/diagnóstico: `docs/OPERACAO.md`.
