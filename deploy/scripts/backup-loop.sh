#!/bin/sh
# Agenda simples: um backup por dia na BACKUP_HORA. Uma falha não derruba o loop (tenta no dia seguinte).
ALVO=$(expr "${BACKUP_HORA:-3}" + 0)   # expr aceita "08"/"09" (printf trataria como octal)
echo "backup agendado para ${ALVO}h · retenção ${BACKUP_RETENCAO_DIAS:-14} dias"
ULTIMO=""
while true; do
  HOJE=$(date +%F)
  if [ "$(expr "$(date +%H)" + 0)" = "$ALVO" ] && [ "$ULTIMO" != "$HOJE" ]; then
    sh /backup.sh || echo "$(date -Iseconds) ERRO no backup"
    ULTIMO=$HOJE
  fi
  sleep 300
done
