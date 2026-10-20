"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, ChevronRight, ClipboardList, Loader2, Plus, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getStartOptionsAction, type StartOptions } from "@/server/actions/workouts";
import { formatDay } from "@/lib/format";
import { useStartWorkout } from "./use-start-workout";

export function StartWorkoutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [options, setOptions] = useState<StartOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { start, pending } = useStartWorkout();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    getStartOptionsAction().then((res) => {
      if (cancelled) return;
      if (res.ok) setOptions(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const templates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (options?.templates ?? []).filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [options, query]);

  async function go(input: Parameters<typeof start>[0], key: string) {
    const ok = await start(input, key);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Training starten" description="Wähle eine Vorlage oder starte frei." size="md">
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => go({}, "free")}
            disabled={pending !== null}
            className="flex w-full items-center gap-3 rounded-md border border-border bg-surface-2 px-3 py-3 text-left transition-colors hover:bg-surface-3 disabled:opacity-60"
          >
            <span className="grid size-10 place-items-center rounded-full bg-accent-soft text-accent">
              {pending === "free" ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
            </span>
            <span className="flex-1">
              <span className="block font-medium">Freies Training</span>
              <span className="block text-sm text-muted">Ohne Vorlage starten, Übungen unterwegs hinzufügen</span>
            </span>
          </button>

          {options?.planned.length ? (
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-subtle">Heute geplant</h3>
              <div className="space-y-1.5">
                {options.planned.map((p) => (
                  <OptionRow
                    key={p.id}
                    icon={<CalendarCheck className="size-4" />}
                    title={p.title}
                    subtitle="Geplante Einheit"
                    loading={pending === p.id}
                    disabled={pending !== null}
                    onClick={() => go({ plannedEntryId: p.id }, p.id)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">Vorlagen</h3>
              <Link href="/templates" onClick={() => onOpenChange(false)} className="text-xs font-medium text-accent hover:underline">
                Verwalten
              </Link>
            </div>
            {(options?.templates.length ?? 0) > 6 ? (
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Vorlage suchen" className="pl-9" aria-label="Vorlage suchen" />
              </div>
            ) : null}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {!options && !error ? (
              <div className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : null}
            {options && templates.length === 0 ? (
              <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
                {options.templates.length === 0 ? (
                  <>
                    Noch keine Vorlagen.{" "}
                    <Link href="/templates/new" onClick={() => onOpenChange(false)} className="font-medium text-accent hover:underline">
                      Vorlage erstellen
                    </Link>
                  </>
                ) : (
                  "Keine Treffer."
                )}
              </div>
            ) : null}
            <div className="space-y-1.5">
              {templates.map((t) => (
                <OptionRow
                  key={t.id}
                  icon={<ClipboardList className="size-4" />}
                  title={t.name}
                  subtitle={`${t.exerciseCount} ${t.exerciseCount === 1 ? "Übung" : "Übungen"}${t.lastUsed ? ` · zuletzt ${formatDay(t.lastUsed, "dayMonth")}` : ""}`}
                  loading={pending === t.id}
                  disabled={pending !== null}
                  onClick={() => go({ templateId: t.id }, t.id)}
                />
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OptionRow({
  icon,
  title,
  subtitle,
  onClick,
  loading,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
    >
      <span className="grid size-9 place-items-center rounded-full bg-surface-3 text-muted">{loading ? <Loader2 className="size-4 animate-spin" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-sm text-muted">{subtitle}</span>
      </span>
      <ChevronRight className="size-4 text-subtle" aria-hidden />
    </button>
  );
}
