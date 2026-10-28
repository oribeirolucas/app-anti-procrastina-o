#!/bin/sh
# Ao subir: aplica migrações pendentes, garante o admin inicial (idempotente) e inicia o servidor.
set -e
node dist/db/migrate.js
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_SENHA" ]; then node dist/db/seed.js; fi
exec node dist/index.js
