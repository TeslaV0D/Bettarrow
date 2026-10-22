import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { guardMutation } from "@/server/request-guard";
import { importData, validateExport } from "@/server/services/data-transfer";
import { createBackup, parseBackupBuffer } from "@/server/services/backups";
import { translateMessage } from "@/lib/i18n";
import { getT } from "@/server/i18n";

export const dynamic = "force-dynamic";

const MAX = 64 * 1024 * 1024;

/**
 * POST ?mode=preview  → validates the uploaded export and returns a summary (no changes).
 * POST ?mode=apply&confirm=ERSETZEN → creates a safety backup, then replaces all data atomically.
 */
export async function POST(request: Request) {
  const denied = await guardMutation(request);
  if (denied) return denied;
  const t = await getT();
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) return Response.json({ ok: false, errors: [t.data.emptyFile] }, { status: 400 });
  if (buf.length > MAX) return Response.json({ ok: false, errors: [t.data.tooLarge] }, { status: 413 });

  let raw: unknown;
  try {
    raw = parseBackupBuffer(buf);
  } catch {
    return Response.json({ ok: false, errors: [t.data.invalidJson] }, { status: 400 });
  }
  const result = validateExport(raw);
  if (!result.ok) return Response.json({ ok: false, errors: result.errors.map((e) => translateMessage(t, e)) }, { status: 422 });
  if (mode !== "apply") return Response.json({ ok: true, summary: result.summary, exportedAt: result.data.exportedAt });

  if (url.searchParams.get("confirm") !== "ERSETZEN") {
    return Response.json({ ok: false, errors: [t.data.confirmMissing] }, { status: 400 });
  }
  let safety: string | null = null;
  try {
    safety = (await createBackup(db, env.BACKUP_DIR, { keep: env.BACKUP_KEEP, label: "vor-import" })).name;
  } catch (err) {
    console.error("[import] safety backup failed:", err);
    return Response.json({ ok: false, errors: [t.data.safetyFailed] }, { status: 500 });
  }
  try {
    await importData(db, result.data);
  } catch (err) {
    console.error("[import] failed:", err);
    return Response.json({ ok: false, errors: [t.data.importFailed] }, { status: 500 });
  }
  revalidatePath("/", "layout");
  return Response.json({ ok: true, summary: result.summary, safetyBackup: safety });
}
