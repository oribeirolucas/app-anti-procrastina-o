# Arquitetura

Plataforma interna da Recepção IA: CRM comercial, agente de IA de atendimento, automações e
dashboard financeiro, compartilhando um único banco PostgreSQL.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Formato | Monólito modular (`/server` + `/client`) | Uma empresa, poucos usuários: microsserviços só adicionariam custo e operação |
| API | tRPC (tipos ponta a ponta) | O front-end quebra na compilação se o contrato da API mudar |
| Banco | PostgreSQL + Drizzle (migrações versionadas em `server/drizzle/`) | Relacional, transações, `numeric` para dinheiro |
| Auth | Própria, no Postgres: argon2id (`@node-rs/argon2`) + sessão em cookie `httpOnly` | Sem dependência externa, roda igual em dev, teste e VPS |
| Front-end | React + Vite + Tailwind, servido pelo próprio servidor Node em produção | Uma só porta/processo, mesma origem (cookie sem CORS) |
| Hospedagem alvo | VPS + Docker Compose | ≤ R$ 100/mês de infraestrutura |

## Módulos

```
server/src/
  auth/        sessões, senhas, limite de tentativas, matriz de permissões
  db/          schema.ts (fonte da verdade), seed.ts, migrate.ts
  lib/         dinheiro (centavos), datas (fuso), csv, auditoria, eventos
  router/      admin, auth, crm/{cadastros, pipeline, relatorios}
  app.ts       servidor HTTP: /trpc, /saude, arquivos do front-end, CSRF por Origin
client/src/
  pages/       uma tela por rota
  components/  ui (botões, modais, estados), formulários, CSV, histórico
```

## Integração entre módulos

- **Eventos**: toda ação relevante (empresa criada, mudança de etapa, oportunidade encerrada,
  resposta do contato, opt-out, contrato criado) grava uma linha em `evento`. O motor de
  automações (etapa 4) consome essa fila, e ela tem chave de idempotência contra duplicidade.
- **Histórico único** (`interacao`): interações humanas, alterações automáticas e (etapa 5) conversas do
  agente de IA ficam na mesma linha do tempo do cliente.
- **Contrato → financeiro**: contratos registram mensalidade e dia de cobrança. A etapa 3 gera as
  contas a receber a partir deles. Oportunidade nunca é contada como receita.

## Segurança aplicada

- Permissões verificadas no servidor em cada procedimento (`comPermissao`), nunca só na interface.
- Token de sessão aleatório (256 bits). O banco guarda só o SHA-256 dele. Cookie `httpOnly`,
  `SameSite=Lax`, `Secure` em produção. Desativar o usuário ou mudar o perfil encerra as sessões dele.
- Login: 5 falhas por e-mail ou 20 por IP em 15 min geram bloqueio temporário. A mensagem de erro é genérica.
- Requisições que mudam estado exigem `Origin` da própria aplicação (CSRF).
- Consultas via Drizzle (parametrizadas), entradas validadas com Zod, erros internos sem detalhes ao cliente.
- CSV exportado neutraliza fórmulas (`=`, `+`, `-`, `@`).
- Ações administrativas registradas em `auditoria`.
