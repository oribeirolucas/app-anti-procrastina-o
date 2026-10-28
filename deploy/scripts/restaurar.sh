#!/bin/sh
# Restaura um backup SOBRE o banco em uso. Destrutivo: tudo o que foi feito depois do backup se perde.
# Faz antes um backup de segurança do estado atual. Uso: scripts/restaurar.sh backups/plataforma-AAAAMMDD-HHMMSS.dump
set -eu
ARQ=${1:?informe o arquivo: scripts/restaurar.sh backups/plataforma-....dump}
[ -f "$ARQ" ] || { echo "Arquivo não encontrado: $ARQ"; exit 1; }
printf "Isto substitui TODOS os dados atuais por %s. Digite RESTAURAR para continuar: " "$(basename "$ARQ")"
read -r OK; [ "$OK" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
echo "1/4 backup de segurança do estado atual"; sh scripts/backup-agora.sh
echo "2/4 parando a aplicação"; docker compose stop app
echo "3/4 restaurando"
docker compose exec -T backup sh -eu -c "
  psql -d postgres -qc 'drop database if exists plataforma with (force)'
  psql -d postgres -qc 'create database plataforma'
  pg_restore --no-owner --no-privileges -d plataforma /backups/$(basename "$ARQ")"
echo "4/4 subindo a aplicação (aplica migrações mais novas, se houver)"; docker compose start app
sleep 5; docker compose ps app
