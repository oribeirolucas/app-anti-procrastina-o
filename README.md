# Plataforma comercial (white-label)

CRM comercial, agente de IA, automações e financeiro num único sistema. Visão de negócio em
[`empresa/README.md`](empresa/README.md). Arquitetura em [`ARCHITECTURE.md`](ARCHITECTURE.md).

Contexto para desenvolvimento: [`CLAUDE.md`](CLAUDE.md) · estado atual: [`docs/progress.md`](docs/progress.md) · critérios: [`docs/requirements.md`](docs/requirements.md)

## Situação das entregas

| Etapa | Situação |
|---|---|
| 1. Fundação (banco, login, perfis, auditoria, interface) | ✅ funcionando e testada |
| 2. CRM (empresas, contatos, pipeline, tarefas, histórico, contratos, CSV, indicadores) | ✅ funcionando e testada |
| 3. Financeiro (lançamentos, contas a pagar/receber, cobranças de contratos, previsto × realizado) | ✅ funcionando e testada |
| 4. Automações (gatilho → condição → ação, follow-up com parada, webhooks e formulários de captação) | ✅ funcionando e testada |
| 5. Agente de IA | ⏳ próxima (requer chave da API Claude) |
| 6. Deploy (Docker, backup) | ⏳ |

## Rodar localmente

Pré-requisitos: Node 22 e PostgreSQL 16.

```bash
# 1. Banco
createuser -P app            # senha: app (apenas desenvolvimento)
createdb -O app plataforma
createdb -O app plataforma_test

# 2. Servidor
cd server
cp .env.example .env          # ajuste ADMIN_EMAIL / ADMIN_SENHA
npm install
npm run db:migrate
npm run db:seed               # admin + etapas padrão
npm run db:seed:ficticios     # opcional: dados de exemplo marcados [FICTÍCIO]
npm run dev                   # http://localhost:3000

# 3. Front-end (outro terminal)
cd client && npm install && npm run dev   # http://localhost:5173
```

Para servir tudo numa porta só: `cd client && npm run build`. O servidor entrega `client/dist`.

## Testes

```bash
cd server && npm test        # recria o banco plataforma_test a cada execução
cd client && npx tsc -b && npm run lint
```

Docs: [operação e diagnóstico](docs/OPERACAO.md) · [permissões](docs/PERMISSOES.md) · [fórmulas dos indicadores](docs/INDICADORES.md)

## Instalar para um cliente
Ver `docs/INSTALACAO.md` (Docker, HTTPS automático, backup diário e restauração testada).
