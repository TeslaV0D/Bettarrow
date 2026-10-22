import type { Metadata } from "next";
import Link from "next/link";
import { ChartColumn, Info } from "lucide-react";
import { db } from "@/server/db";
import { getPeriodStats } from "@/server/services/stats";
import { getCatalog, getReferenceData } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { PERIOD_KEYS, periodRange, startOfWeek, todayIn, type PeriodKey } from "@/lib/dates";
import { formatDay, formatDuration, formatNumber, formatVolume, type WeightUnit } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodPicker } from "@/components/stats/period-picker";
import { TrendChart } from "@/components/stats/trend-chart";
import { MuscleTable } from "@/components/stats/muscle-table";
import { DayHeatmap } from "@/components/stats/day-heatmap";
import { Sparkbars } from "@/components/charts/sparkline";
import { fmt, plural } from "@/lib/i18n";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).stats.title };
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const [settings, t] = await Promise.all([getSettings(), getT()]);
  const today = todayIn(settings.timezone);
  const key: PeriodKey = PERIOD_KEYS.includes(sp.period as PeriodKey) ? (sp.period as PeriodKey) : "last_90";
  const range = periodRange(key, today, settings.weekStart, { from: sp.from, to: sp.to });
  const unit = settings.weightUnit as WeightUnit;
  const [stats, catalog, reference] = await Promise.all([
    getPeriodStats(db, range, today, {
      bodyweightInVolume: settings.bodyweightInVolume,
      secondaryMuscleWeight: settings.secondaryMuscleWeight,
      weekStart: settings.weekStart,
    }),
    getCatalog(),
    getReferenceData(),
  ]);
  const labels = Object.fromEntries(reference.muscles.map((m) => [m.id, m.name]));
  const exName = new Map(catalog.map((e) => [e.id, e.name]));
  const totals = stats.totals;
  const currentKey = stats.bucketUnit === "week" ? startOfWeek(today, settings.weekStart) : today.slice(0, 8) + "01";
  const trendMax = Math.max(1, ...stats.groupTrend.flatMap((g) => g.values));

  return (
    <div className="space-y-4">
      <header className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{t.stats.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {formatDay(stats.from, "medium")} – {formatDay(stats.to, "medium")}
          </p>
        </div>
        <PeriodPicker value={key} from={range.from ?? stats.from} to={range.to ?? stats.to} />
      </header>

      {totals.sessions === 0 ? (
        <Card>
          <EmptyState icon={ChartColumn} title={t.stats.emptyTitle} description={t.stats.emptyText} />
        </Card>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            <Kpi label={t.dashboard.sessions} value={String(totals.sessions)} />
            <Kpi label={t.stats.trainingDays} value={String(totals.trainingDays)} />
            <Kpi label={t.dashboard.workingSets} value={String(totals.workingSets)} />
            <Kpi label={t.dashboard.volume} value={formatVolume(totals.volumeKg, unit)} hint={totals.volumeIncomplete ? t.stats.partlyNoLoad : undefined} />
            <Kpi label={t.stats.avgDuration} value={formatDuration(totals.avgDurationSeconds)} />
            <Kpi label={t.stats.avgSets} value={formatNumber(totals.avgSetsPerSession, 1)} />
          </dl>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="min-w-0 p-4 sm:p-5">
              <TrendChart buckets={stats.buckets} unit={unit} bucketUnit={stats.bucketUnit} currentKey={currentKey} />
            </Card>
            <Card className="p-4 sm:p-5">
              <h2 className="text-[15px] font-semibold">{t.stats.consistency}</h2>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Mini label={t.stats.activeWeeks} value={`${stats.consistency.activeWeeks}/${stats.consistency.weeks}`} />
                <Mini label={t.stats.streak} value={String(stats.consistency.currentStreak)} />
                <Mini label={t.stats.longestStreak} value={String(stats.consistency.longestStreak)} />
              </dl>
              <p className="mt-3 text-sm text-muted">{fmt(t.stats.avgPerWeek, { value: formatNumber(stats.consistency.avgSessionsPerWeek, 1) })}</p>
              <div className="mt-3">
                <DayHeatmap days={stats.trainingDays} from={stats.from} to={stats.to} weekStart={settings.weekStart} t={t} />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-4 sm:p-5">
              <h2 className="mb-1 text-[15px] font-semibold">{t.stats.muscleGroups}</h2>
              <p className="mb-4 text-sm text-muted">{t.stats.muscleGroupsHint}</p>
              <MuscleTable rows={stats.muscles} labels={labels} unit={unit} secondaryWeight={settings.secondaryMuscleWeight} />
            </Card>
            <Card className="p-4 sm:p-5">
              <h2 className="mb-1 text-[15px] font-semibold">{t.stats.groupTrend}</h2>
              <p className="mb-4 text-sm text-muted">{stats.bucketUnit === "week" ? t.stats.groupTrendHintWeek : t.stats.groupTrendHintMonth}</p>
              <ul className="space-y-2.5">
                {stats.groupTrend.map((g) => (
                  <li key={g.groupId} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="truncate">{labels[g.groupId] ?? g.groupId}</span>
                    <Sparkbars values={g.values} max={trendMax} label={`${labels[g.groupId]}: ${g.values.join(", ")}`} />
                    <span className="tabular text-right text-muted">{formatNumber(g.values.reduce((a, b) => a + b, 0), 1)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title={t.stats.topExercises} />
              <ul className="mt-2 divide-y divide-border border-t border-border">
                {stats.topExercises.map((e) => (
                  <li key={e.exerciseId}>
                    <Link href={`/exercises/${e.exerciseId}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-surface-2/60 sm:px-5">
                      <span className="truncate font-medium">{exName.get(e.exerciseId) ?? e.exerciseId}</span>
                      <span className="tabular shrink-0 text-muted">
                        {plural(t.units.sets, e.workingSets)} · {e.sessions}× {e.volumeKg ? `· ${formatVolume(e.volumeKg, unit)}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Info className="size-4 text-muted" /> {t.stats.howCalculated}
              </h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
                <li>{t.stats.calc1}</li>
                <li>{t.stats.calc2}</li>
                <li>{settings.bodyweightInVolume ? t.stats.calc3 : t.stats.calc3Excluded}</li>
                <li>{fmt(t.stats.calc4, { factor: formatNumber(settings.secondaryMuscleWeight, 2) })}</li>
                <li>{fmt(t.stats.calc5, { timezone: settings.timezone })}</li>
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-xl font-semibold tracking-tight">{value}</dd>
      {hint ? <dd className="text-xs text-warning">{hint}</dd> : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular text-lg font-semibold">{value}</dd>
    </div>
  );
}
