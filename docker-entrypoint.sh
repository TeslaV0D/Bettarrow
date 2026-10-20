#!/bin/sh
# Ensures the backup directory is writable, then drops root privileges.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "${BACKUP_DIR:-/backups}"
  chown app:app "${BACKUP_DIR:-/backups}" 2>/dev/null || echo "[bettarrow] warning: cannot chown ${BACKUP_DIR:-/backups}"
  exec su-exec app "$@"
fi
exec "$@"
