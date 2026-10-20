#!/usr/bin/env sh
# Restores a dump created by backup-db.sh. ALL CURRENT DATA IS REPLACED.
#   ./scripts/restore-db.sh ./backups/db-2026-10-20T03-00-00.dump
# Env: DB_CONTAINER (bettarrow-db), WEB_CONTAINER (bettarrow-web), MIGRATE_CONTAINER (bettarrow-migrate)
set -eu
DB="${DB_CONTAINER:-bettarrow-db}"
WEB="${WEB_CONTAINER:-bettarrow-web}"
MIGRATE="${MIGRATE_CONTAINER:-bettarrow-migrate}"
FILE="${1:?Usage: restore-db.sh <dump-file>}"
[ -f "$FILE" ] || { echo "File not found: $FILE" >&2; exit 1; }
printf 'This replaces ALL data in the Bettarrow database with %s.\nType RESTORE to continue: ' "$FILE"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "Aborted."; exit 1; }

docker stop "$WEB" > /dev/null
docker exec "$DB" sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE);" -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"'
docker exec -i "$DB" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges --exit-on-error' < "$FILE"
# Bring an older dump up to the current schema, then start the app again.
docker start -a "$MIGRATE"
docker start "$WEB" > /dev/null
echo "Restore finished."
