import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { authSessions } from "@/server/db/schema";
import { env } from "@/server/env";
import { sha256Hex, verifyPasswordHash, verifyPlainPassword } from "@/server/password";

export const SESSION_COOKIE = "bettarrow_session";
const DAY = 86_400_000;

async function isSecureRequest(): Promise<boolean> {
  if (env.COOKIE_SECURE === "true") return true;
  if (env.COOKIE_SECURE === "false") return false;
  const h = await headers();
  return (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
}

export async function verifyPassword(password: string): Promise<boolean> {
  if (!password) return false;
  if (env.APP_PASSWORD_HASH) return verifyPasswordHash(password, env.APP_PASSWORD_HASH);
  if (env.APP_PASSWORD) return verifyPlainPassword(password, env.APP_PASSWORD);
  return false;
}

export async function createSession(): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE_DAYS * DAY);
  const h = await headers();
  await db.insert(authSessions).values({
    id: sha256Hex(token),
    expiresAt,
    userAgent: (h.get("user-agent") ?? "").slice(0, 300) || null,
  });
  // Opportunistic cleanup of expired sessions.
  await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: await isSecureRequest(),
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(authSessions).where(eq(authSessions.id, sha256Hex(token)));
  jar.delete(SESSION_COOKIE);
}

/** Validates the session cookie against the database (memoized per request). */
export const getSession = cache(async (): Promise<{ id: string } | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const id = sha256Hex(token);
  const now = new Date();
  const [row] = await db
    .select({ id: authSessions.id, lastSeenAt: authSessions.lastSeenAt })
    .from(authSessions)
    .where(and(eq(authSessions.id, id), gt(authSessions.expiresAt, now)))
    .limit(1);
  if (!row) return null;
  // Sliding expiration, written at most once per hour.
  if (now.getTime() - row.lastSeenAt.getTime() > 3_600_000) {
    await db
      .update(authSessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + env.SESSION_MAX_AGE_DAYS * DAY) })
      .where(eq(authSessions.id, id));
  }
  return { id };
});

/** For pages and layouts: redirects to the login page when not authenticated. */
export async function requirePageAuth(): Promise<void> {
  if (!(await getSession())) redirect("/login");
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Nicht angemeldet");
  }
}

/** For server actions and route handlers. */
export async function requireAuth(): Promise<void> {
  if (!(await getSession())) throw new UnauthorizedError();
}

// ---------------------------------------------------------------------------
// Login rate limiting (in memory; the app runs as a single process)
// ---------------------------------------------------------------------------

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 8;
const failures = new Map<string, number[]>();

export async function clientKey(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export function isRateLimited(key: string, max = MAX_FAILURES): boolean {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list.length >= max;
}

export function recordFailure(key: string) {
  const list = failures.get(key) ?? [];
  list.push(Date.now());
  failures.set(key, list);
}

export function clearFailures(key: string) {
  failures.delete(key);
}
