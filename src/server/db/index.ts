import "server-only";
import { createDb } from "./client";
import { env } from "@/server/env";
import type { Db } from "./types";

const globalForDb = globalThis as unknown as { __bettarrowDb?: Db };

/** Process-wide database handle (reused across hot reloads in development). */
export const db: Db = globalForDb.__bettarrowDb ?? createDb(env.DATABASE_URL).db;
if (process.env.NODE_ENV !== "production") globalForDb.__bettarrowDb = db;

export type { Db };
