"use client";

import { useState } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { Segmented } from "@/components/ui/segmented";
import { formatDay, formatNumber, formatVolume, kgToUnit, type WeightUnit } from "@/lib/format";
import type { Bucket } from "@/server/services/stats";

type Metric = "sessions" | "workingSets" | "volumeKg";

export function TrendChart({ buckets, unit, bucketUnit, currentKey }: { buckets: Bucket[]; unit: WeightUnit; bucketUnit: "week" | "month"; currentKey: string }) {
  const [metric, setMetric] = useState<Metric>("sessions");
  const label = (k: string) => (bucketUnit === "week" ? formatDay(k, "dayMonth") : formatDay(k, "month").split(" ")[0].slice(0, 3));
  const period = (k: string) => (bucketUnit === "week" ? `Woche ab ${formatDay(k, "dayMonth")}` : formatDay(k, "month"));
  const fmt = (b: Bucket) =>
    metric === "sessions" ? `${b.sessions} ${b.sessions === 1 ? "Training" : "Trainings"}` : metric === "workingSets" ? `${b.workingSets} Arbeitssätze` : formatVolume(b.volumeKg, unit);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{bucketUnit === "week" ? "Pro Woche" : "Pro Monat"}</h2>
        <Segmented
          size="sm"
          aria-label="Kennzahl"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "sessions", label: "Trainings" },
            { value: "workingSets", label: "Sätze" },
            { value: "volumeKg", label: "Volumen" },
          ]}
        />
      </div>
      <BarChart
        ariaLabel={`${metric === "sessions" ? "Trainings" : metric === "workingSets" ? "Arbeitssätze" : "Volumen"} ${bucketUnit === "week" ? "pro Woche" : "pro Monat"}`}
        data={buckets.map((b) => ({
          key: b.key,
          label: label(b.key),
          value: metric === "volumeKg" ? kgToUnit(b[metric], unit) : b[metric],
          tooltip: `${period(b.key)}: ${fmt(b)}`,
        }))}
        highlightKey={currentKey}
        formatTick={(v) => (metric === "volumeKg" && v >= 1000 ? `${formatNumber(v / 1000, 1)}k` : formatNumber(v, 1))}
      />
    </div>
  );
}
