# Arquitetura

## Decisão: monorepo simples (sem workspaces tool como Turborepo/Nx)

Estrutura:

```
/server   -> API Node.js + tRPC + Drizzle (PostgreSQL)
/client   -> React + Tailwind (Vite)
```

Motivo: o MVP tem escopo pequeno (um formulário, um motor de scoring, um painel admin).
Ferramentas de monorepo (Turborepo, Nx, pnpm workspaces) adicionam complexidade de configuração
sem benefício real nesse estágio — dois `package.json` independentes, cada um com seu próprio
`node_modules`, são suficientes. Se o projeto crescer (ex.: pacote compartilhado de tipos entre
client/server), reavaliar.

## /server

- **Runtime**: Node.js (TypeScript)
- **API**: tRPC (`src/router`) — roteador raiz vazio nesta etapa, endpoints vêm depois
- **ORM**: Drizzle (`src/db`)
  - `src/db/schema.ts` — definição das tabelas (espelha a seção 4.1 do PRD)
  - `src/db/index.ts` — client de conexão (node-postgres)
  - `drizzle/` — migrations geradas (`drizzle-kit generate`)
- **Auth**: Supabase Auth. O client faz login diretamente contra o Supabase (front-end);
  o server só precisa validar o JWT do Supabase nas rotas do painel admin (não implementado
  ainda nesta etapa — só a variável de ambiente e a estrutura de pasta `src/auth/` reservada).
- **Scripts de validação**: `src/db/seed-validation.ts` — insere registros de exemplo em
  `veiculo_tecnico` para confirmar que os campos condicionais aceitam NULL corretamente.

## /client

- **Build tool**: Vite (mais rápido que CRA, zero config extra para React+TS+Tailwind)
- **Styling**: Tailwind CSS
- Nesta etapa, só o scaffold — sem formulário nem chamadas tRPC ainda.

## Nomenclatura

- Tabelas/campos do banco seguem os nomes em português do PRD (schema é fonte da verdade).
- Código (TypeScript) usa `camelCase` para variáveis/objetos, seguindo convenção do Drizzle,
  mas os nomes de coluna no banco (snake_case em português) são preservados via `drizzle-orm`
  usando `.$type` e o segundo argumento de cada coluna (nome real da coluna SQL).

## Decisões não explícitas no PRD

1. **Vite em vez de Next.js/CRA** para o client — o PRD só especifica "React + Tailwind", sem
   framework de meta-routing. Como não há SSR necessário no MVP, Vite é a opção mais simples.
2. **node-postgres (`pg`) como driver** do Drizzle, por ser o mais maduro para Postgres puro
   (não usamos Supabase como client de dados, só como provedor de Auth — o Postgres é acessado
   diretamente via Drizzle, seguindo a stack pedida).
3. **drizzle-kit** para gerar/rodar migrations (`npm run db:generate` / `db:migrate` em `/server`).
4. Enum `categoria_veiculo` modelado com `pgEnum` do Drizzle, mapeando 1:1 com o SQL do PRD.
5. Pasta `src/auth/` no server reservada para o middleware de validação de JWT do Supabase,
   usado futuramente pelas rotas do painel admin (seção 6 do PRD) — não implementado nesta etapa.
