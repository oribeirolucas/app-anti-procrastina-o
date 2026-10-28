#!/bin/sh
# Gera um backup (pg_dump formato custom), confere se ele é legível e apaga os antigos.
# Roda dentro do serviço "backup" (variáveis PG* já definidas). Saída: /backups/plataforma-AAAAMMDD-HHMMSS.dump
set -eu
DESTINO=/backups
ARQ="$DESTINO/plataforma-$(date +%Y%m%d-%H%M%S).dump"
mkdir -p "$DESTINO"
pg_dump -Fc --no-owner --no-privileges -f "$ARQ.parcial"
# Um backup que não lista o conteúdo é inútil: falha alto em vez de guardar lixo.
pg_restore --list "$ARQ.parcial" > /dev/null
mv "$ARQ.parcial" "$ARQ"
echo "$(date -Iseconds) backup ok: $ARQ ($(du -h "$ARQ" | cut -f1))"
find "$DESTINO" -name 'plataforma-*.dump' -mtime +"${BACKUP_RETENCAO_DIAS:-14}" -print -delete
if [ -n "${RCLONE_DESTINO:-}" ]; then
  command -v rclone > /dev/null || apk add --no-cache rclone > /dev/null
  rclone copy "$ARQ" "$RCLONE_DESTINO" && echo "$(date -Iseconds) cópia externa ok: $RCLONE_DESTINO"
fi
