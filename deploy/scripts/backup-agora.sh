#!/bin/sh
# Backup imediato (ex.: antes de uma atualização). Rode na pasta deploy/.
set -eu
docker compose exec -T backup sh /backup.sh
