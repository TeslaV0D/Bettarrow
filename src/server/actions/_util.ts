import "server-only";
import { ZodError } from "zod";
import { UnauthorizedError, requireAuth } from "@/server/auth";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** User-facing error whose message may be shown as is. */
export class UserError extends Error {}

/**
 * Wraps a server action body: enforces authentication, converts validation and domain errors into
 * safe messages and never leaks internal details (stack traces, SQL) to the client.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireAuth();
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: "Sitzung abgelaufen. Bitte neu anmelden." };
    if (err instanceof ZodError) return { ok: false, error: err.issues[0]?.message ?? "Ungültige Eingabe" };
    if (err instanceof UserError) return { ok: false, error: err.message };
    // Next.js control flow (redirect/notFound) must propagate.
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
    console.error("[action] unexpected error:", err);
    return { ok: false, error: "Etwas ist schiefgelaufen. Bitte versuche es erneut." };
  }
}
