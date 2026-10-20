#!/usr/bin/env sh
# PostgreSQL dump (custom format) of the running Bettarrow stack. Works for Portainer stacks and
# plain Docker Compose alike (uses container names, no compose project directory needed).
#   ./scripts/backup-db.sh [target-dir]        default: ./backups
# Env: DB_CONTAINER (default bettarrow-db)
set -eu
DB="${DB_CONTAINER:-bettarrow-db}"
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%S)"
FILE="$OUT_DIR/db-$STAMP.dump"
docker exec "$DB" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$FILE.partial"
mv "$FILE.partial" "$FILE"
# Verify the dump is readable.
docker exec -i "$DB" pg_restore --list < "$FILE" > /dev/null
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
