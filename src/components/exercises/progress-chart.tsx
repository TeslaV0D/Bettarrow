"use client";

import { useMemo, useState } from "react";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { Segmented } from "@/components/ui/segmented";
import { diffDays } from "@/lib/dates";
import { formatClock, formatDay, formatNumber, formatVolume, formatWeight, kgToUnit, type WeightUnit } from "@/lib/format";
import type { ExerciseSession } from "@/server/services/stats";

type Metric = "top" | "e1rm" | "volume" | "reps" | "sets" | "duration";

/** One metric at a time (single series, single axis). */
export function ProgressChart({ sessions, unit, hasLoad, hasE1rm, duration }: { sessions: ExerciseSession[]; unit: WeightUnit; hasLoad: boolean; hasE1rm: boolean; duration: boolean }) {
  const options = (
    [
      hasLoad && { value: "top", label: "Top-Satz" },
      hasE1rm && { value: "e1rm", label: "e1RM" },
      hasLoad && !duration && { value: "volume", label: "Volumen" },
      !duration && { value: "reps", label: "Wdh." },
      duration && { value: "duration", label: "Dauer" },
      { value: "sets", label: "Sätze" },
    ].filter(Boolean) as { value: Metric; label: string }[]
  );
  const [metric, setMetric] = useState<Metric>(options[0].value);
  const first = sessions[0]?.date;

  const points = useMemo(() => {
    const val = (s: ExerciseSession): number | null => {
      switch (metric) {
        case "top":
          return s.topLoad != null ? kgToUnit(s.topLoad, unit) : null;
        case "e1rm":
          return s.bestE1rm != null ? kgToUnit(s.bestE1rm, unit) : null;
        case "volume":
          return kgToUnit(s.volumeKg, unit);
        case "reps":
          return s.totalReps;
        case "duration":
          return s.maxDuration;
        default:
          return s.workingSets;
      }
    };
    const fmt = (s: ExerciseSession, v: number) => {
      switch (metric) {
        case "top":
          return `${formatWeight(s.topLoad, unit)} × ${s.topLoadReps ?? "–"}`;
        case "e1rm":
          return `≈ ${formatWeight(s.bestE1rm, unit)} (Schätzung)`;
        case "volume":
          return formatVolume(s.volumeKg, unit);
        case "reps":
          return `${v} Wdh. gesamt (max. ${s.maxReps ?? "–"})`;
        case "duration":
          return formatClock(v);
        default:
          return `${v} Arbeitssätze`;
      }
    };
    return sessions
      .map((s) => ({ s, v: val(s) }))
      .filter((x): x is { s: ExerciseSession; v: number } => x.v != null && x.v > 0)
      .map(({ s, v }) => ({ x: diffDays(s.date, first ?? s.date), y: v, label: formatDay(s.date, "dayMonth"), tooltip: fmt(s, v), key: s.workoutId }));
  }, [sessions, metric, unit, first]);

  return (
    <div>
      <div className="no-scrollbar mb-4 overflow-x-auto">
        <Segmented size="sm" aria-label="Kennzahl" value={metric} onChange={setMetric} options={options} />
      </div>
      {points.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Keine Werte für diese Kennzahl.</p>
      ) : metric === "sets" || metric === "reps" ? (
        <BarChart
          ariaLabel="Verlauf"
          data={points.slice(-30).map((p) => ({ key: p.key, label: p.label, value: p.y, tooltip: `${p.label}: ${p.tooltip}` }))}
          formatTick={(v) => formatNumber(v, 0)}
        />
      ) : (
        <LineChart
          ariaLabel="Verlauf"
          points={points}
          zeroBased={metric === "volume"}
          formatTick={(v) => (metric === "duration" ? formatClock(v) : v >= 10000 ? `${formatNumber(v / 1000, 1)}k` : formatNumber(v, 1))}
        />
      )}
      {metric === "e1rm" ? <p className="mt-2 text-xs text-subtle">Geschätztes 1RM nach Epley aus Sätzen mit 1–12 Wiederholungen – eine Schätzung, kein gemessener Wert.</p> : null}
    </div>
  );
}
