# Instalação de um cliente (modelo A: uma instalação por cliente)

Meta: cliente novo no ar, com HTTPS e backup diário, em menos de 1 hora.
Tudo roda em uma VPS com Docker: aplicação, PostgreSQL, Caddy (HTTPS automático) e backup.

## 0. Antes de começar
| O que | Onde | Observação |
|---|---|---|
| VPS Linux (Ubuntu 24.04), 2 GB de RAM, 1 vCPU, 40 GB de disco | Hetzner, Contabo, Hostinger, Magalu Cloud… | Uma VPS por cliente. Custo típico R$ 30–60/mês (confirme a cotação). |
| Domínio do cliente, ex.: `crm.cliente.com.br` | Registro.br / painel DNS do cliente | Crie um registro **A** apontando para o IP da VPS. |
| (Recomendado) Bucket para cópia externa do backup | Backblaze B2, AWS S3, Cloudflare R2 | Sem isso, se a VPS se perder, o backup se perde junto. |

## 1. Preparar a VPS (≈10 min)
```sh
ssh root@IP_DA_VPS
curl -fsSL https://get.docker.com | sh
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
git clone <URL_DO_REPOSITORIO> /opt/plataforma && cd /opt/plataforma/deploy
```

## 2. Configurar (≈5 min)
```sh
cp .env.example .env && chmod 600 .env
openssl rand -base64 24   # use como DB_SENHA
nano .env                 # DOMINIO, DB_SENHA, ADMIN_EMAIL, ADMIN_SENHA, backup externo
```
Nunca reutilize a `DB_SENHA` entre clientes. O `.env` não vai para o Git.

## 3. Subir (≈10 min, a primeira construção é a mais lenta)
```sh
docker compose up -d --build
docker compose ps          # app e db devem aparecer "healthy"
curl https://SEU_DOMINIO/saude   # {"ok":true,"banco":"ok"}
```
Ao subir, a aplicação aplica as migrações e cria o admin do `.env` (só se ainda não existir).

## 4. Entregar ao cliente (≈15 min)
1. Entre com o admin e **troque a senha**. Depois apague `ADMIN_SENHA` do `.env`.
2. Administração → Configurações: nome da empresa e fuso.
3. Administração → Planos e preços, Pipeline e Uso e limites (franquia contratada).
4. Crie os usuários do cliente (gestor/operador).
5. Rode `scripts/backup-agora.sh` e `scripts/testar-restauracao.sh` para deixar o primeiro backup comprovado.

## Perfil do nicho (o "treinamento" do time de IA do cliente)
Modelos em `empresa/verticais/`: `clinica-estetica.json` e `imobiliaria.json`. Cada um traz o funil do nicho, a etapa do lead qualificado, a base de conhecimento a preencher e os 3 agentes (atendimento, pós-qualificação e pós-venda).
```sh
cp empresa/verticais/imobiliaria.json /tmp/cliente.json   # preencha os [colchetes] com o formulário de kickoff
BASE_URL=https://SEU_DOMINIO E2E_EMAIL=admin@... E2E_SENHA=... node deploy/scripts/aplicar-perfil.mjs /tmp/cliente.json            # simulação
BASE_URL=https://SEU_DOMINIO E2E_EMAIL=admin@... E2E_SENHA=... node deploy/scripts/aplicar-perfil.mjs /tmp/cliente.json --aplicar
```
Os agentes chegam **inativos**. Revise em Agentes IA, faça a bateria de testes e só então ative.

## Backup
- **Automático:** todo dia na `BACKUP_HORA` (no fuso do cliente), em `deploy/backups/`, mantendo `BACKUP_RETENCAO_DIAS` dias.
  Cada arquivo é conferido (`pg_restore --list`) antes de ser aceito.
- **Cópia externa:** preencha as variáveis `RCLONE_*` no `.env` (exemplo para Backblaze B2 no próprio arquivo).
- **Agora:** `scripts/backup-agora.sh`
- **Comprovar que restaura (sem tocar nos dados):** `scripts/testar-restauracao.sh [arquivo]`.
  Restaura num banco temporário e mostra a contagem de registros ao lado do banco em uso. Faça isso **todo mês**.
- **Acompanhar:** `docker compose logs backup` mostra "backup ok" ou "ERRO" de cada dia.

## Restaurar (destrutivo)
```sh
scripts/restaurar.sh backups/plataforma-AAAAMMDD-HHMMSS.dump
```
Pede para digitar `RESTAURAR`, faz antes um backup de segurança do estado atual, para a aplicação,
substitui o banco e sobe de novo. Tudo o que foi registrado depois do backup escolhido se perde.

## Atualizar para uma versão nova
```sh
scripts/atualizar.sh            # última versão do branch
scripts/atualizar.sh v1.3.0     # versão específica
```
Faz backup, baixa o código, reconstrói, sobe e confere `/saude`. Se falhar, mostra o comando para voltar.
Atenção: voltar o código não desfaz migração de banco. Nesse caso, restaure o backup do passo 1.

## Diagnóstico rápido
| Sintoma | Verificar |
|---|---|
| Site não abre / sem HTTPS | DNS aponta para a VPS? Portas 80/443 abertas? `docker compose logs caddy` |
| `/saude` responde `503` | Banco fora: `docker compose ps db` e `docker compose logs db` |
| Aplicação reiniciando | `docker compose logs app` (erro de migração aparece aqui, com mensagem clara) |
| Backup não aparece | `docker compose logs backup`. Disco cheio? `df -h` |

Mais diagnóstico da aplicação em `docs/OPERACAO.md`.
