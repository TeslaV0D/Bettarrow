"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { formatNumber, formatVolume, type WeightUnit } from "@/lib/format";
import type { MuscleRow } from "@/server/services/stats";
import { fmt } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";

/** Direct (solid) and indirect (lighter, same hue) contribution per muscle group, as horizontal bars. */
export function MuscleTable({ rows, labels, unit, secondaryWeight }: { rows: MuscleRow[]; labels: Record<string, string>; unit: WeightUnit; secondaryWeight: number }) {
  const [metric, setMetric] = useState<"sets" | "volume">("sets");
  const t = useT();
  const val = (r: MuscleRow) => (metric === "sets" ? [r.directSets, r.indirectSets * secondaryWeight] : [r.directVolume, r.indirectVolume * secondaryWeight]);
  const sorted = [...rows].sort((a, b) => val(b)[0] + val(b)[1] - (val(a)[0] + val(a)[1]));
  const max = Math.max(1, ...sorted.map((r) => val(r)[0] + val(r)[1]));
  const total = sorted.reduce((a, r) => a + val(r)[0] + val(r)[1], 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-accent" /> {t.stats.direct}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-accent/40" /> {fmt(t.stats.indirectTimes, { factor: formatNumber(secondaryWeight, 2) })}
          </span>
        </div>
        <Segmented
          size="sm"
          aria-label={t.stats.metric}
          value={metric}
          onChange={setMetric}
          options={[
            { value: "sets", label: t.progress.sets },
            { value: "volume", label: t.dashboard.volume },
          ]}
        />
      </div>
      {sorted.length === 0 ? <p className="py-6 text-center text-sm text-muted">{t.stats.noData}</p> : null}
      <ul className="space-y-2.5">
        {sorted.map((r) => {
          const [d, i] = val(r);
          const sum = d + i;
          return (
            <li key={r.muscleId} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_9rem]" title={fmt(t.stats.muscleTitle, { name: labels[r.muscleId] ?? r.muscleId, direct: r.directSets, indirect: r.indirectSets })}>
              <span className="truncate">{labels[r.muscleId] ?? r.muscleId}</span>
              <span className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-surface-3" aria-hidden>
                {d > 0 ? <span className="h-full rounded-full bg-accent" style={{ width: `${(d / max) * 100}%` }} /> : null}
                {i > 0 ? <span className="h-full rounded-full bg-accent/40" style={{ width: `${(i / max) * 100}%` }} /> : null}
              </span>
              <span className="tabular text-right text-muted">
                {metric === "sets" ? formatNumber(sum, 1) : formatVolume(sum, unit)}
                <span className="ml-1.5 text-xs text-subtle">{total ? Math.round((sum / total) * 100) : 0} %</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
