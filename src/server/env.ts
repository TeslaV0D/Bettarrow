import { z } from "zod";

const boolish = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0", "yes", "no"])
    .optional()
    .transform((v) => (v === undefined ? def : ["true", "1", "yes"].includes(v)));

const schema = z.object({
  DATABASE_URL: z.string().min(1).default("postgres://bettarrow:bettarrow@localhost:5432/bettarrow"),
  /** scrypt hash created with `npm run hash-password` (preferred). */
  APP_PASSWORD_HASH: z.string().optional(),
  /** Plain password (fallback, e.g. for quick local setups). */
  APP_PASSWORD: z.string().optional(),
  SESSION_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** auto: secure cookies when the request arrived via https (x-forwarded-proto). */
  COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
  DEFAULT_TIMEZONE: z.string().default("Europe/Berlin"),
  BACKUP_DIR: z.string().default("./backups"),
  BACKUP_INTERVAL_HOURS: z.coerce.number().min(0).default(24),
  BACKUP_KEEP: z.coerce.number().int().min(1).default(14),
  MIGRATE_ON_START: boolish(true),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export const env = load();

export function assertProductionEnv() {
  if (!env.APP_PASSWORD_HASH && !env.APP_PASSWORD) {
    throw new Error(
      "No password configured. Set APP_PASSWORD_HASH (recommended, see README) or APP_PASSWORD in .env.",
    );
  }
  if (env.APP_PASSWORD && !env.APP_PASSWORD_HASH && env.APP_PASSWORD.length < 8) {
    throw new Error("APP_PASSWORD must be at least 8 characters long.");
  }
}
