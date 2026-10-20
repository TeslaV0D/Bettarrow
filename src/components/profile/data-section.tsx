"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Database, Download, FileUp, HardDriveDownload, RotateCcw, ShieldCheck } from "lucide-react";
import { createBackupAction, restoreBackupAction } from "@/server/actions/profile";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Summary {
  exercises: number;
  customExercises: number;
  templates: number;
  workouts: number;
  sets: number;
  plannedEntries: number;
  bodyWeight: number;
}

export function DataSection({ backups }: { backups: { dir: string; interval: number; keep: number; files: { name: string; size: number; createdAt: string }[] } }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ summary: Summary; exportedAt: string } | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoreName, setRestoreName] = useState<string | null>(null);

  async function upload(mode: "preview" | "apply") {
    if (!file) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/import?mode=${mode}${mode === "apply" ? "&confirm=ERSETZEN" : ""}`, { method: "POST", body: file, headers: { "content-type": "application/octet-stream" } });
      const data = await res.json().catch(() => ({ ok: false, errors: ["Unerwartete Antwort vom Server."] }));
      if (!data.ok) {
        setErrors(data.errors ?? ["Import fehlgeschlagen."]);
        setPreview(null);
        return;
      }
      if (mode === "preview") {
        setErrors(null);
        setPreview({ summary: data.summary, exportedAt: data.exportedAt });
      } else {
        toast.success(`Import abgeschlossen. Sicherheits-Backup: ${data.safetyBackup}`);
        reset();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setErrors(null);
    setConfirm("");
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Download className="size-4 text-muted" /> Export
        </h2>
        <p className="mt-1 text-sm text-muted">
          Vollständiger Export als JSON: Profil, Einstellungen, Übungen, Vorlagen, Kalender, Trainings mit allen Sätzen und Notizen sowie Körpergewicht. Format dokumentiert in docs/EXPORT_FORMAT.md.
        </p>
        <a href="/api/export" className={buttonClasses("secondary", "md", "mt-4")} download>
          <Download className="size-4" /> Daten exportieren
        </a>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <FileUp className="size-4 text-muted" /> Import
        </h2>
        <p className="mt-1 text-sm text-muted">Stellt einen Export oder ein Backup (.json / .json.gz) wieder her. Alle aktuellen Daten werden ersetzt – vorher wird automatisch ein Sicherheits-Backup erstellt.</p>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.gz,application/json,application/gzip"
          className="mt-4 block w-full text-sm text-muted file:mr-3 file:h-10 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:text-sm file:font-medium file:text-text"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setErrors(null);
          }}
          aria-label="Exportdatei wählen"
        />
        {file && !preview ? (
          <Button className="mt-3" onClick={() => upload("preview")} loading={busy}>
            Datei prüfen
          </Button>
        ) : null}
        {errors ? (
          <div className="mt-3 rounded-md border border-danger/40 bg-danger-soft p-3 text-sm" role="alert">
            <p className="font-medium text-danger">Datei kann nicht importiert werden</p>
            <ul className="mt-1 list-disc pl-5 text-muted">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {preview ? (
          <div className="mt-3 space-y-3 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm">
            <p className="font-medium text-warning">Gültige Exportdatei vom {new Date(preview.exportedAt).toLocaleString("de-DE")}</p>
            <p className="text-muted">
              {preview.summary.workouts} Trainings · {preview.summary.sets} Sätze · {preview.summary.templates} Vorlagen · {preview.summary.customExercises} eigene Übungen · {preview.summary.plannedEntries} Kalendereinträge ·{" "}
              {preview.summary.bodyWeight} Gewichtseinträge
            </p>
            <p>
              Zum Ersetzen aller aktuellen Daten <strong>ERSETZEN</strong> eingeben:
            </p>
            <div className="flex gap-2">
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Bestätigung" placeholder="ERSETZEN" />
              <Button variant="danger" disabled={confirm !== "ERSETZEN"} loading={busy} onClick={() => upload("apply")}>
                Importieren
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              Abbrechen
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="p-4 sm:p-5 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              <ShieldCheck className="size-4 text-muted" /> Backups
            </h2>
            <p className="mt-1 text-sm text-muted">
              {backups.interval ? `Automatisch alle ${backups.interval} h` : "Automatische Backups deaktiviert"} · die letzten {backups.keep} werden behalten · Verzeichnis <code className="text-xs">{backups.dir}</code>
            </p>
          </div>
          <Button
            onClick={async () => {
              const res = await createBackupAction();
              if (!res.ok) return void toast.error(res.error);
              toast.success(`Backup erstellt: ${res.data.name}`);
              router.refresh();
            }}
          >
            <Database className="size-4" /> Backup jetzt erstellen
          </Button>
        </div>
        {backups.files.length ? (
          <ul className="mt-4 divide-y divide-border rounded-md border border-border">
            {backups.files.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.name}</span>
                <span className="tabular text-xs text-subtle">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                <a href={`/api/backups/${encodeURIComponent(f.name)}`} className="grid size-9 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-text" aria-label={`${f.name} herunterladen`} download>
                  <HardDriveDownload className="size-4" />
                </a>
                <button type="button" onClick={() => setRestoreName(f.name)} className="grid size-9 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-text" aria-label={`${f.name} wiederherstellen`}>
                  <RotateCcw className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted">Noch keine Backups vorhanden.</p>
        )}
        <p className="mt-3 text-xs text-subtle">
          App-Backups enthalten alle Daten im Exportformat. Zusätzlich empfiehlt sich ein Datenbank-Dump (scripts/backup-db.sh) und eine Kopie außerhalb des Servers – siehe README.
        </p>
      </Card>

      <RestoreDialog name={restoreName} onClose={() => setRestoreName(null)} onDone={() => router.refresh()} />
    </div>
  );
}

function RestoreDialog({ name, onClose, onDone }: { name: string | null; onClose: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!name} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        title="Backup wiederherstellen?"
        description={`Alle aktuellen Daten werden durch ${name} ersetzt. Vorher wird ein Sicherheits-Backup erstellt.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={confirm !== "ERSETZEN"}
              onClick={async () => {
                if (!name) return;
                setBusy(true);
                const res = await restoreBackupAction(name, confirm);
                setBusy(false);
                if (!res.ok) return void toast.error(res.error);
                toast.success(`Wiederhergestellt: ${res.data.workouts} Trainings`);
                setConfirm("");
                onClose();
                onDone();
              }}
            >
              Wiederherstellen
            </Button>
          </>
        }
      >
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="ERSETZEN" aria-label="Zur Bestätigung ERSETZEN eingeben" />
      </DialogContent>
    </Dialog>
  );
}
