#!/bin/sh
# Prova que o backup restaura: carrega o arquivo num banco TEMPORÁRIO e compara a contagem de registros
# com o banco em uso. Não toca nos dados reais. Uso: scripts/testar-restauracao.sh [arquivo.dump]
set -eu
ARQ=${1:-$(ls -1t backups/plataforma-*.dump 2>/dev/null | head -1)}
[ -n "$ARQ" ] && [ -f "$ARQ" ] || { echo "Nenhum backup encontrado em backups/"; exit 1; }
NOME=$(basename "$ARQ")
echo "Testando $NOME..."
TABELAS="usuario empresa contato oportunidade contrato lancamento tarefa interacao automacao plano"
CONTA="select string_agg(t || '=' || n, ' ' order by t) from ($(for t in $TABELAS; do printf "select '%s' t, count(*) n from %s union all " "$t" "$t"; done | sed 's/ union all $//')) x"
docker compose exec -T backup sh -eu -c "
  dropdb --if-exists teste_restauracao; createdb teste_restauracao
  pg_restore --no-owner --no-privileges -d teste_restauracao /backups/$NOME
  echo \"backup : \$(psql -d teste_restauracao -Atc \"$CONTA\")\"
  dropdb teste_restauracao"
echo "(o banco em uso pode ter registros novos criados depois do backup)"
docker compose exec -T backup psql -Atc "$CONTA" | sed 's/^/em uso  : /'
