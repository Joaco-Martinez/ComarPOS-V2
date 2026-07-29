#!/usr/bin/env bash
# Backup manual de la base de Postgres (Railway) via pg_dump, corrido con
# Docker para no depender de tener postgresql-client instalado localmente.
#
# Uso: npm run backup
# Requiere Docker Desktop corriendo y DATABASE_URL en el entorno (.env).
#
# Esto es un complemento, NO un reemplazo de backups automaticos:
# Railway ofrece backups automaticos de Postgres desde su dashboard
# (Database -> Backups) - activarlos ahi es el paso mas importante y no
# requiere nada de este script.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  export $(grep -v '^#' .env | grep DATABASE_URL | xargs)
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ Falta DATABASE_URL (revisá tu .env)"
  exit 1
fi

mkdir -p backups
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/comarpos-backup-${TIMESTAMP}.sql"

echo "🗄️  Generando backup en $OUT ..."

docker run --rm postgres:16 pg_dump "$DATABASE_URL" --no-owner --no-privileges > "$OUT"

echo "✅ Backup listo: $OUT ($(du -h "$OUT" | cut -f1))"
