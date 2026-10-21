import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Build info baked into the Docker image (APP_VERSION / APP_REVISION build args). */
const build = {
  version: process.env.APP_VERSION || "dev",
  revision: process.env.APP_REVISION || "unknown",
};

/**
 * Liveness + database check for container health checks. Exposes no user data; the build info
 * shows which image is actually running (repository, image and running stack are separate states).
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ok", ...build }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(
      { status: "error", database: "unreachable", ...build },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
