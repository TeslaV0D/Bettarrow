import { readFile } from "node:fs/promises";
import { getSession } from "@/server/auth";
import { env } from "@/server/env";
import { resolveBackupPath } from "@/server/services/backups";

export const dynamic = "force-dynamic";

/** Download of a backup file from BACKUP_DIR. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  if (!(await getSession())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { name } = await ctx.params;
  const p = resolveBackupPath(env.BACKUP_DIR, name);
  if (!p) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    const buf = await readFile(/*turbopackIgnore: true*/ p);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": name.endsWith(".gz") ? "application/gzip" : "application/json",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
