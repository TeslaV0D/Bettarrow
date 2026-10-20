/**
 * Database connection string: DATABASE_URL if set, otherwise built from the POSTGRES_* variables
 * (as used by docker compose / Portainer). Building it here URL-encodes credentials, so passwords
 * may contain any characters.
 */
export function resolveDatabaseUrl(e: NodeJS.ProcessEnv = process.env): string {
  if (e.DATABASE_URL) return e.DATABASE_URL;
  if (e.POSTGRES_PASSWORD) {
    const enc = encodeURIComponent;
    const user = enc(e.POSTGRES_USER || "bettarrow");
    const db = enc(e.POSTGRES_DB || "bettarrow");
    const host = e.POSTGRES_HOST || "localhost";
    const port = e.POSTGRES_PORT || "5432";
    return `postgres://${user}:${enc(e.POSTGRES_PASSWORD)}@${host}:${port}/${db}`;
  }
  return "postgres://bettarrow:bettarrow@localhost:5432/bettarrow";
}
