import "server-only";
import { ZodError } from "zod";
import { UnauthorizedError, requireAuth } from "@/server/auth";
import { translateMessage } from "@/lib/i18n";
import { getT } from "@/server/i18n";
import { UserError } from "@/server/errors";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export { UserError };

/**
 * Wraps a server action body: enforces authentication, converts validation and domain errors into
 * safe messages and never leaks internal details (stack traces, SQL) to the client.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireAuth();
    return { ok: true, data: await fn() };
  } catch (err) {
    const t = await getT();
    if (err instanceof UnauthorizedError) return { ok: false, error: t.errors.sessionExpired };
    if (err instanceof ZodError) return { ok: false, error: err.issues[0] ? translateMessage(t, err.issues[0].message) : t.errors.invalidInput };
    if (err instanceof UserError) return { ok: false, error: translateMessage(t, err.message) };
    // Next.js control flow (redirect/notFound) must propagate.
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
    console.error("[action] unexpected error:", err);
    return { ok: false, error: t.errors.unexpected };
  }
}
