#!/usr/bin/env sh
# Creates a PostgreSQL dump (custom format) of the Bettarrow database via Docker Compose.
#   ./scripts/backup-db.sh                 -> ./backups/db-YYYY-MM-DDTHH-MM-SS.dump
#   ./scripts/backup-db.sh /path/to/dir
# Run from the directory containing docker-compose.yml.
set -eu
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%S)"
FILE="$OUT_DIR/db-$STAMP.dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' > "$FILE.partial"
mv "$FILE.partial" "$FILE"
# Verify the dump is readable.
docker compose exec -T db pg_restore --list < "$FILE" > /dev/null
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
