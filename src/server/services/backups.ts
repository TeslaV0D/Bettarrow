import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Db } from "@/server/db/types";
import { exportData } from "./data-transfer";

export const BACKUP_RE = /^bettarrow-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})(-[a-z0-9-]+)?\.json(\.gz)?$/;

export function isAutomaticBackup(name: string): boolean {
  const m = BACKUP_RE.exec(name);
  return !!m && !m[2];
}

export interface BackupFile {
  name: string;
  size: number;
  createdAt: Date;
}

function stamp(d: Date) {
  return d.toISOString().slice(0, 19).replace(/:/g, "-");
}

/** Writes a gzipped JSON export into `dir` (atomically via rename) and prunes old automatic backups. */
export async function createBackup(db: Db, dir: string, opts: { keep: number; label?: string; now?: Date }): Promise<BackupFile> {
  const now = opts.now ?? new Date();
  await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  const data = await exportData(db, now);
  const name = `bettarrow-${stamp(now)}${opts.label ? `-${opts.label}` : ""}.json.gz`;
  const tmp = path.join(dir, `.${name}.tmp`);
  const buf = gzipSync(Buffer.from(JSON.stringify(data)));
  await writeFile(/*turbopackIgnore: true*/ tmp, buf, { mode: 0o600 });
  await rename(/*turbopackIgnore: true*/ tmp, path.join(dir, name));
  await pruneBackups(dir, opts.keep);
  return { name, size: buf.length, createdAt: now };
}

export async function listBackups(dir: string): Promise<BackupFile[]> {
  let names: string[];
  try {
    names = await readdir(/*turbopackIgnore: true*/ dir);
  } catch {
    return [];
  }
  const files = await Promise.all(
    names
      .filter((n) => BACKUP_RE.test(n))
      .map(async (name) => {
        const st = await stat(/*turbopackIgnore: true*/ path.join(dir, name));
        return { name, size: st.size, createdAt: st.mtime };
      }),
  );
  return files.sort((a, b) => b.name.localeCompare(a.name));
}

/** Keeps the newest `keep` automatic backups; labelled backups (e.g. before an import) are kept as well, up to `keep`. */
export async function pruneBackups(dir: string, keep: number) {
  const files = await listBackups(dir);
  const auto = files.filter((f) => isAutomaticBackup(f.name));
  const labelled = files.filter((f) => !isAutomaticBackup(f.name));
  for (const f of [...auto.slice(keep), ...labelled.slice(keep)]) await unlink(/*turbopackIgnore: true*/ path.join(dir, f.name)).catch(() => {});
}

export function resolveBackupPath(dir: string, name: string): string | null {
  if (!BACKUP_RE.test(name)) return null;
  const p = path.resolve(dir, name);
  return path.dirname(p) === path.resolve(dir) ? p : null;
}

export async function readBackup(dir: string, name: string): Promise<unknown> {
  const p = resolveBackupPath(dir, name);
  if (!p) throw new Error("Ungültiger Dateiname");
  return parseBackupBuffer(await readFile(/*turbopackIgnore: true*/ p));
}

/** Parses a (optionally gzipped) JSON export. */
export function parseBackupBuffer(buf: Buffer): unknown {
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  return JSON.parse(raw.toString("utf8"));
}
