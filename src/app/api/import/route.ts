import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { guardMutation } from "@/server/request-guard";
import { importData, validateExport } from "@/server/services/data-transfer";
import { createBackup, parseBackupBuffer } from "@/server/services/backups";

export const dynamic = "force-dynamic";

const MAX = 64 * 1024 * 1024;

/**
 * POST ?mode=preview  → validates the uploaded export and returns a summary (no changes).
 * POST ?mode=apply&confirm=ERSETZEN → creates a safety backup, then replaces all data atomically.
 */
export async function POST(request: Request) {
  const denied = await guardMutation(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0) return Response.json({ ok: false, errors: ["Leere Datei."] }, { status: 400 });
  if (buf.length > MAX) return Response.json({ ok: false, errors: ["Datei ist zu groß (max. 64 MB)."] }, { status: 413 });

  let raw: unknown;
  try {
    raw = parseBackupBuffer(buf);
  } catch {
    return Response.json({ ok: false, errors: ["Datei ist kein gültiges JSON (oder beschädigtes .gz)."] }, { status: 400 });
  }
  const result = validateExport(raw);
  if (!result.ok) return Response.json({ ok: false, errors: result.errors }, { status: 422 });
  if (mode !== "apply") return Response.json({ ok: true, summary: result.summary, exportedAt: result.data.exportedAt });

  if (url.searchParams.get("confirm") !== "ERSETZEN") {
    return Response.json({ ok: false, errors: ["Bestätigung fehlt."] }, { status: 400 });
  }
  let safety: string | null = null;
  try {
    safety = (await createBackup(db, env.BACKUP_DIR, { keep: env.BACKUP_KEEP, label: "vor-import" })).name;
  } catch (err) {
    console.error("[import] safety backup failed:", err);
    return Response.json({ ok: false, errors: ["Sicherheits-Backup vor dem Import konnte nicht geschrieben werden. Import abgebrochen."] }, { status: 500 });
  }
  try {
    await importData(db, result.data);
  } catch (err) {
    console.error("[import] failed:", err);
    return Response.json({ ok: false, errors: ["Import fehlgeschlagen – es wurden keine Daten verändert."] }, { status: 500 });
  }
  revalidatePath("/", "layout");
  return Response.json({ ok: true, summary: result.summary, safetyBackup: safety });
}
