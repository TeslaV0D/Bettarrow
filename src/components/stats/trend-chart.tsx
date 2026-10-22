"use client";

import { useState } from "react";
import { BarChart } from "@/components/charts/bar-chart";
import { Segmented } from "@/components/ui/segmented";
import { formatDay, formatNumber, formatVolume, kgToUnit, type WeightUnit } from "@/lib/format";
import type { Bucket } from "@/server/services/stats";
import { fmt, plural } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";

type Metric = "sessions" | "workingSets" | "volumeKg";

export function TrendChart({ buckets, unit, bucketUnit, currentKey }: { buckets: Bucket[]; unit: WeightUnit; bucketUnit: "week" | "month"; currentKey: string }) {
  const [metric, setMetric] = useState<Metric>("sessions");
  const t = useT();
  const label = (k: string) => (bucketUnit === "week" ? formatDay(k, "dayMonth") : formatDay(k, "month").split(" ")[0].slice(0, 3));
  const period = (k: string) => (bucketUnit === "week" ? fmt(t.stats.weekFrom, { date: formatDay(k, "dayMonth") }) : formatDay(k, "month"));
  const value = (b: Bucket) =>
    metric === "sessions" ? plural(t.units.workouts, b.sessions) : metric === "workingSets" ? plural(t.units.workingSets, b.workingSets) : formatVolume(b.volumeKg, unit);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{bucketUnit === "week" ? t.stats.perWeek : t.stats.perMonth}</h2>
        <Segmented
          size="sm"
          aria-label={t.stats.metric}
          value={metric}
          onChange={setMetric}
          options={[
            { value: "sessions", label: t.dashboard.sessions },
            { value: "workingSets", label: t.progress.sets },
            { value: "volumeKg", label: t.dashboard.volume },
          ]}
        />
      </div>
      <BarChart
        ariaLabel={`${metric === "sessions" ? t.dashboard.sessions : metric === "workingSets" ? t.dashboard.workingSets : t.dashboard.volume} ${bucketUnit === "week" ? t.stats.perWeekLower : t.stats.perMonthLower}`}
        data={buckets.map((b) => ({
          key: b.key,
          label: label(b.key),
          value: metric === "volumeKg" ? kgToUnit(b[metric], unit) : b[metric],
          tooltip: `${period(b.key)}: ${value(b)}`,
        }))}
        highlightKey={currentKey}
        formatTick={(v) => (metric === "volumeKg" && v >= 1000 ? `${formatNumber(v / 1000, 1)}${t.progress.thousandSuffix}` : formatNumber(v, 1))}
      />
    </div>
  );
}
