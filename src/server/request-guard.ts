import "server-only";
import { getSession } from "@/server/auth";

/**
 * Guards state-changing route handlers: requires a valid session and a same-origin request
 * (CSRF protection in addition to SameSite=Lax cookies).
 */
export async function guardMutation(request: Request): Promise<Response | null> {
  if (!(await getSession())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!host || originHost !== host) return Response.json({ error: "forbidden" }, { status: 403 });
  } else if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}
