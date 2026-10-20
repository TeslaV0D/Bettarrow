#!/usr/bin/env sh
# Restores a dump created by backup-db.sh. ALL CURRENT DATA IS REPLACED.
#   ./scripts/restore-db.sh ./backups/db-2026-10-20T03-00-00.dump
# The web container is stopped during the restore and started again afterwards.
set -eu
FILE="${1:?Usage: restore-db.sh <dump-file>}"
[ -f "$FILE" ] || { echo "File not found: $FILE" >&2; exit 1; }
printf 'This replaces ALL data in the Bettarrow database with %s.\nType RESTORE to continue: ' "$FILE"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "Aborted."; exit 1; }

docker compose stop web
docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);" -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < "$FILE"
docker compose start web
echo "Restore finished. Pending migrations (if the dump is older) are applied automatically on start."
