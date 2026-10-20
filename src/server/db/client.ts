import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import type { Db } from "./types";

export function createDb(url: string, max = 10): { db: Db; close: () => Promise<void> } {
  const client = postgres(url, { max, idle_timeout: 30, onnotice: () => {} });
  const db = drizzle(client, { schema, casing: "snake_case" });
  return { db, close: () => client.end({ timeout: 5 }) };
}
