"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Check, MessageSquare, SlidersHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatClock, formatNumber, kgToUnit, unitToKg, type WeightUnit } from "@/lib/format";
import { SET_TYPE_LABELS, SET_TYPE_SHORT, SET_TYPES, computeLoad, type LoadMode, type SetType, type Tracking } from "@/lib/training";
import { parseDecimal, parseDurationInput, parseIntStrict, type LSet, type PreviousSet } from "@/lib/workout-reducer";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";

export interface RowLayout {
  showWeight: boolean;
  weightEditable: boolean;
  showEffort: boolean;
  tracking: Tracking;
}

function columns(l: RowLayout, withEffort: boolean): string {
  // set | previous | weight | reps/time | effort | check
  const cols = ["2.25rem", "minmax(0,1fr)"];
  if (l.showWeight) cols.push("4.75rem");
  cols.push(l.tracking === "duration" ? "4.75rem" : "4rem");
  if (withEffort) cols.push("3.25rem");
  cols.push("2.75rem");
  return cols.join(" ");
}

/** Grid columns as CSS variables; the effort column is only shown inline from the `sm` breakpoint. */
export function gridStyle(l: RowLayout): React.CSSProperties {
  return { "--cols": columns(l, false), "--cols-sm": columns(l, l.showEffort) } as React.CSSProperties;
}

export const GRID_CLASS = "grid grid-cols-[var(--cols)] sm:grid-cols-[var(--cols-sm)]";

function fmtWeight(kg: number | null, unit: WeightUnit) {
  return kg == null ? "" : formatNumber(kgToUnit(kg, unit), 2);
}

export function formatPrevious(p: PreviousSet | undefined, tracking: Tracking, loadMode: LoadMode, unit: WeightUnit): string {
  if (!p) return "–";
  if (tracking === "duration") {
    const t = p.durationSeconds != null ? formatClock(p.durationSeconds) : "–";
    return p.weightKg ? `${fmtWeight(p.weightKg, unit)} × ${t}` : t;
  }
  const reps = p.reps ?? "–";
  if (loadMode === "bodyweight" || loadMode === "none") return `${reps} Wdh.`;
  if (p.weightKg == null) return loadMode === "external" ? `${reps} Wdh.` : `KG × ${reps}`;
  const sign = loadMode === "bodyweight_plus" ? "+" : loadMode === "bodyweight_minus" ? "−" : "";
  return `${sign}${fmtWeight(p.weightKg, unit)} × ${reps}`;
}

export interface SetRowProps {
  exId: string;
  set: LSet;
  label: string;
  previous: PreviousSet | undefined;
  layout: RowLayout;
  loadMode: LoadMode;
  bodyweightFactor: number;
  bodyweightKg: number | null;
  unit: WeightUnit;
  effortMetric: "none" | "rir" | "rpe";
  onUpdate: (exId: string, setId: string, patch: Partial<LSet>) => void;
  onToggle: (exId: string, setId: string) => void;
  onRemove: (exId: string, setId: string) => void;
  onDetails: (exId: string, setId: string) => void;
}

/** Text input that keeps its own text while typing and commits parsed values. */
function NumField({
  value,
  format,
  parse,
  onCommit,
  placeholder,
  ariaLabel,
  inputMode,
  done,
  disabled,
}: {
  value: number | null;
  format: (v: number | null) => string;
  parse: (t: string) => number | null | undefined;
  onCommit: (v: number | null) => void;
  placeholder: string;
  ariaLabel: string;
  inputMode: "decimal" | "numeric";
  done: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value, format]);
  const invalid = parse(text) === undefined;
  return (
    <input
      type="text"
      inputMode={inputMode}
      enterKeyHint="next"
      autoComplete="off"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      data-set-input
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        focused.current = false;
        const v = parse(text);
        if (v === undefined) setText(format(value));
        else setText(format(v));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const v = parse(e.target.value);
        if (v !== undefined && v !== value) onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-set-input]"));
          const i = all.indexOf(e.currentTarget);
          if (i >= 0 && all[i + 1]) all[i + 1].focus();
          else e.currentTarget.blur();
        }
      }}
      className={cn(
        "tabular h-11 w-full min-w-0 rounded-sm border bg-surface-2 px-1 text-center text-[16px] font-semibold text-text placeholder:font-normal placeholder:text-subtle",
        "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20",
        done ? "border-transparent bg-transparent" : "border-border",
        invalid && "border-danger/70",
      )}
    />
  );
}

export const SetRow = memo(function SetRow({
  exId,
  set,
  label,
  previous,
  layout,
  loadMode,
  bodyweightFactor,
  bodyweightKg,
  unit,
  effortMetric,
  onUpdate,
  onToggle,
  onRemove,
  onDetails,
}: SetRowProps) {
  const done = set.completed;
  const fmtW = (v: number | null) => fmtWeight(v, unit);
  const parseW = (t: string) => {
    const v = parseDecimal(t);
    return v == null ? v : unitToKg(v, unit);
  };
  const fmtInt = (v: number | null) => (v == null ? "" : String(v));
  const fmtDur = (v: number | null) => (v == null ? "" : formatClock(v));
  const fmtEffort = (v: number | null) => (v == null ? "" : formatNumber(v, 1));
  const parseEffort = (t: string) => {
    const v = parseDecimal(t);
    if (v == null || v === undefined) return v;
    return effortMetric === "rpe" ? (v >= 1 && v <= 10 ? v : undefined) : v <= 10 ? v : undefined;
  };
  const load = computeLoad({ loadMode, bodyweightFactor, bodyweightKg, weightKg: set.weightKg });
  const typeTone: Record<SetType, string> = {
    working: "text-muted",
    warmup: "text-warning",
    dropset: "text-info",
    failure: "text-danger",
  };

  return (
    <div
      className={cn(GRID_CLASS, "items-center gap-1.5 rounded-md px-1 py-1 transition-colors", done && "bg-accent-softer")}
      style={gridStyle(layout)}
    >
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            className={cn("tabular grid h-11 place-items-center rounded-sm text-sm font-semibold hover:bg-surface-3", typeTone[set.setType])}
            aria-label={`Satz ${label}, ${SET_TYPE_LABELS[set.setType]} – Optionen`}
          >
            <span className="relative">
              {label}
              {set.note ? <span className="absolute -right-1.5 -top-0.5 size-1.5 rounded-full bg-info" aria-hidden /> : null}
            </span>
          </button>
        </DropdownTrigger>
        <DropdownContent align="start">
          <DropdownLabel>Satztyp</DropdownLabel>
          {SET_TYPES.map((t) => (
            <DropdownItem key={t} onSelect={() => onUpdate(exId, set.id, { setType: t })}>
              <span className={cn("w-4 text-center text-xs font-bold", typeTone[t])}>{SET_TYPE_SHORT[t] || "#"}</span>
              {SET_TYPE_LABELS[t]}
              {set.setType === t ? <Check className="ml-auto size-4 text-accent" /> : null}
            </DropdownItem>
          ))}
          <DropdownSeparator />
          <DropdownItem icon={effortMetric === "none" ? MessageSquare : SlidersHorizontal} onSelect={() => onDetails(exId, set.id)}>
            {effortMetric === "none" ? "Notiz" : `${effortMetric.toUpperCase()} & Notiz`}
          </DropdownItem>
          <DropdownItem icon={Trash2} destructive onSelect={() => onRemove(exId, set.id)}>
            Satz löschen
          </DropdownItem>
        </DropdownContent>
      </Dropdown>

      <button
        type="button"
        className="truncate text-left text-sm text-subtle hover:text-muted disabled:hover:text-subtle"
        disabled={!previous || done}
        title="Vorherige Werte übernehmen"
        onClick={() =>
          previous &&
          onUpdate(exId, set.id, {
            weightKg: layout.weightEditable ? previous.weightKg : set.weightKg,
            reps: previous.reps,
            durationSeconds: previous.durationSeconds,
          })
        }
      >
        {formatPrevious(previous, layout.tracking, loadMode, unit)}
      </button>

      {layout.showWeight ? (
        layout.weightEditable ? (
          <div className="relative">
            <NumField
              value={set.weightKg}
              format={fmtW}
              parse={parseW}
              onCommit={(v) => onUpdate(exId, set.id, { weightKg: v })}
              placeholder={previous?.weightKg != null ? fmtW(previous.weightKg) : loadMode === "external" ? unit : "0"}
              ariaLabel={loadMode === "bodyweight_plus" ? "Zusatzgewicht" : loadMode === "bodyweight_minus" ? "Unterstützung" : "Gewicht"}
              inputMode="decimal"
              done={done}
            />
            {loadMode !== "external" && load != null ? (
              <span className="tabular pointer-events-none absolute -bottom-0.5 left-0 right-0 text-center text-[10px] leading-none text-subtle">
                = {fmtW(load)}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="tabular text-center text-sm text-muted" title="Körpergewicht × Faktor">
            {load != null ? fmtW(load) : "KG"}
          </span>
        )
      ) : null}

      {layout.tracking === "duration" ? (
        <NumField
          value={set.durationSeconds}
          format={fmtDur}
          parse={parseDurationInput}
          onCommit={(v) => onUpdate(exId, set.id, { durationSeconds: v })}
          placeholder={previous?.durationSeconds != null ? fmtDur(previous.durationSeconds) : "0:00"}
          ariaLabel="Dauer (m:ss oder Sekunden)"
          inputMode="numeric"
          done={done}
        />
      ) : (
        <NumField
          value={set.reps}
          format={fmtInt}
          parse={parseIntStrict}
          onCommit={(v) => onUpdate(exId, set.id, { reps: v })}
          placeholder={previous?.reps != null ? String(previous.reps) : "0"}
          ariaLabel="Wiederholungen"
          inputMode="numeric"
          done={done}
        />
      )}

      {layout.showEffort ? (
        <div className="hidden sm:block">
        <NumField
          value={effortMetric === "rpe" ? set.rpe : set.rir}
          format={fmtEffort}
          parse={parseEffort}
          onCommit={(v) => onUpdate(exId, set.id, effortMetric === "rpe" ? { rpe: v } : { rir: v })}
          placeholder="–"
          ariaLabel={effortMetric.toUpperCase()}
          inputMode="decimal"
          done={done}
        />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onToggle(exId, set.id)}
        aria-pressed={done}
        aria-label={done ? `Satz ${label} als offen markieren` : `Satz ${label} abhaken`}
        className={cn(
          "grid size-11 place-items-center rounded-md border transition-colors active:scale-95",
          done ? "border-accent bg-accent text-accent-ink" : "border-border-strong bg-surface-2 text-subtle hover:text-text",
        )}
      >
        <Check className="size-5" strokeWidth={done ? 3 : 2} aria-hidden />
      </button>
    </div>
  );
});
