"use client";

import { useRouter } from "next/navigation";
import { memo, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Ellipsis, Info, Plus, Replace, StickyNote, Timer, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CatalogExercise } from "@/lib/exercise-search";
import { formatClock, formatDay, formatWeight, type WeightUnit } from "@/lib/format";
import { isBodyweightMode, weightInputLabel } from "@/lib/training";
import type { LExercise, LSet } from "@/lib/workout-reducer";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { SetRow, gridColumns, type RowLayout } from "./set-row";

export interface ExerciseCardProps {
  ex: LExercise;
  index: number;
  count: number;
  meta: CatalogExercise | undefined;
  subtitle: string;
  unit: WeightUnit;
  effortMetric: "none" | "rir" | "rpe";
  bodyweightKg: number | null;
  defaultRest: number;
  onUpdateSet: (exId: string, setId: string, patch: Partial<LSet>) => void;
  onToggleSet: (exId: string, setId: string) => void;
  onRemoveSet: (exId: string, setId: string) => void;
  onSetDetails: (exId: string, setId: string) => void;
  onAddSet: (exId: string) => void;
  onMove: (exId: string, dir: -1 | 1) => void;
  onRemove: (exId: string) => void;
  onReplace: (exId: string) => void;
  onNotes: (exId: string, notes: string) => void;
  onRest: (exId: string) => void;
}

export const ExerciseCard = memo(function ExerciseCard(p: ExerciseCardProps) {
  const { ex, meta, unit, effortMetric } = p;
  const router = useRouter();
  const [editingNote, setEditingNote] = useState(false);
  const wLabel = weightInputLabel(ex.loadMode);
  const layout: RowLayout = useMemo(
    () => ({
      showWeight: wLabel != null || ex.loadMode === "bodyweight",
      weightEditable: wLabel != null,
      showEffort: effortMetric !== "none" && ex.tracking === "reps",
      tracking: ex.tracking,
    }),
    [wLabel, ex.loadMode, ex.tracking, effortMetric],
  );
  const doneCount = ex.sets.filter((s) => s.completed).length;
  let workingNo = 0;
  const labels = ex.sets.map((s) => (s.setType === "warmup" ? "W" : String(++workingNo)));
  const rest = ex.restSeconds ?? meta?.restSeconds ?? p.defaultRest;

  return (
    <section className="rounded-lg border border-border bg-surface" aria-labelledby={`ex-${ex.id}`}>
      <header className="flex items-start gap-2 px-3 pt-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <h2 id={`ex-${ex.id}`} className="truncate text-[16px] font-semibold tracking-tight">
            {meta?.name ?? ex.exerciseId}
          </h2>
          <p className="truncate text-sm text-muted">
            {p.subtitle}
            <span className="text-subtle">
              {" "}
              · {doneCount}/{ex.sets.length} Sätze
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => p.onRest(ex.id)}
          className="tabular flex h-9 items-center gap-1 rounded-sm px-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text"
          aria-label={`Ruhezeit ${formatClock(rest)} ändern`}
        >
          <Timer className="size-3.5" aria-hidden />
          {formatClock(rest)}
        </button>
        <Dropdown>
          <DropdownTrigger asChild>
            <Button size="icon-sm" variant="ghost" aria-label={`Aktionen für ${meta?.name ?? "Übung"}`}>
              <Ellipsis className="size-4" />
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem icon={StickyNote} onSelect={() => setEditingNote(true)}>
              Notiz
            </DropdownItem>
            <DropdownItem icon={Replace} onSelect={() => p.onReplace(ex.id)}>
              Übung tauschen
            </DropdownItem>
            <DropdownItem icon={ArrowUp} disabled={p.index === 0} onSelect={() => p.onMove(ex.id, -1)}>
              Nach oben
            </DropdownItem>
            <DropdownItem icon={ArrowDown} disabled={p.index === p.count - 1} onSelect={() => p.onMove(ex.id, 1)}>
              Nach unten
            </DropdownItem>
            {meta ? (
              <DropdownItem icon={Info} onSelect={() => router.push(`/exercises/${meta.id}`)}>
                Übungsdetails & Verlauf
              </DropdownItem>
            ) : null}
            <DropdownSeparator />
            <DropdownItem icon={Trash2} destructive onSelect={() => p.onRemove(ex.id)}>
              Übung entfernen
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </header>

      {editingNote || ex.notes ? (
        <div className="px-3 pt-2 sm:px-4">
          <textarea
            autoFocus={editingNote && !ex.notes}
            defaultValue={ex.notes ?? ""}
            onBlur={(e) => {
              p.onNotes(ex.id, e.target.value.trim());
              setEditingNote(false);
            }}
            rows={1}
            maxLength={2000}
            placeholder="Notiz zur Übung"
            aria-label="Notiz zur Übung"
            className="w-full resize-none rounded-sm border border-transparent bg-warning-soft/60 px-2 py-1.5 text-sm text-text placeholder:text-subtle focus:border-warning/40 focus:outline-none"
          />
        </div>
      ) : null}

      {isBodyweightMode(ex.loadMode) ? (
        <p className="px-3 pt-1.5 text-xs text-subtle sm:px-4">
          {p.bodyweightKg != null
            ? `Körpergewicht ${formatWeight(p.bodyweightKg, unit)}${ex.bodyweightFactor !== 1 ? ` × ${String(ex.bodyweightFactor).replace(".", ",")}` : ""}${
                ex.loadMode === "bodyweight_plus" ? " + Zusatzgewicht" : ex.loadMode === "bodyweight_minus" ? " − Unterstützung" : ""
              } = Gesamtlast`
            : "Kein Körpergewicht hinterlegt – Gesamtlast kann nicht berechnet werden."}
        </p>
      ) : null}

      <div className="px-2 pb-2 pt-2 sm:px-3">
        <div
          className="grid gap-1.5 px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-subtle"
          style={{ gridTemplateColumns: gridColumns(layout) }}
          aria-hidden
        >
          <span className="text-center">Satz</span>
          <span>
            Vorher
            {ex.previous ? <span className="normal-case tracking-normal"> · {formatDay(ex.previous.date, "dayMonth")}</span> : null}
          </span>
          {layout.showWeight ? <span className="text-center">{layout.weightEditable ? wLabel?.replace("kg", unit) : unit}</span> : null}
          <span className="text-center">{ex.tracking === "duration" ? "Zeit" : "Wdh."}</span>
          {layout.showEffort ? <span className="text-center">{effortMetric.toUpperCase()}</span> : null}
          <span />
        </div>
        <div className="space-y-0.5">
          {ex.sets.map((s, i) => (
            <SetRow
              key={s.id}
              exId={ex.id}
              set={s}
              label={labels[i]}
              previous={ex.previous?.sets[i]}
              layout={layout}
              loadMode={ex.loadMode}
              bodyweightFactor={ex.bodyweightFactor}
              bodyweightKg={p.bodyweightKg}
              unit={unit}
              effortMetric={effortMetric}
              onUpdate={p.onUpdateSet}
              onToggle={p.onToggleSet}
              onRemove={p.onRemoveSet}
              onDetails={p.onSetDetails}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => p.onAddSet(ex.id)}
          className={cn("mt-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium text-muted hover:bg-surface-2 hover:text-text")}
        >
          <Plus className="size-4" aria-hidden />
          Satz hinzufügen
        </button>
      </div>
    </section>
  );
});
