/* Applies migrations + reference data (development helper: `npm run db:migrate`). */
import { migrateAndSeed } from "../src/server/db/migrate";

const url = process.env.DATABASE_URL ?? "postgres://bettarrow:bettarrow@localhost:5432/bettarrow";
migrateAndSeed(url, { defaultTimezone: process.env.DEFAULT_TIMEZONE })
  .then(() => {
    console.log("[migrate] database is up to date");
  })
  .catch((err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
