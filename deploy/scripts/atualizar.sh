#!/bin/sh
# Atualiza a instalação para a versão mais nova do repositório, com backup antes e conferência depois.
# Uso (na pasta deploy/): scripts/atualizar.sh [ref-do-git]   ex.: scripts/atualizar.sh v1.3.0
set -eu
REF=${1:-}
ANTERIOR=$(git rev-parse --short HEAD)
echo "Versão atual: $ANTERIOR"
echo "1/4 backup antes de atualizar"; sh scripts/backup-agora.sh
echo "2/4 baixando código"; git fetch --quiet origin
if [ -n "$REF" ]; then git checkout --quiet "$REF"; else git pull --quiet --ff-only; fi
NOVA=$(git rev-parse --short HEAD)
echo "3/4 construindo e subindo $NOVA"; VERSAO=$NOVA docker compose up -d --build app
echo "4/4 conferindo saúde"
for i in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "OK: versão $NOVA no ar."; exit 0
  fi
  sleep 3
done
echo "FALHA: a versão $NOVA não respondeu. Para voltar o código: git checkout $ANTERIOR && VERSAO=$ANTERIOR docker compose up -d --build app"
echo "Se a nova versão aplicou migração de banco, restaure o backup feito no passo 1 (scripts/restaurar.sh)."
exit 1
