import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, History } from "lucide-react";
import { listHistory } from "@/server/queries/history";
import { getCatalog } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StartWorkoutButton } from "@/components/shell/start-workout-button";
import { formatDay, formatDuration, formatVolume, type WeightUnit } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { plural } from "@/lib/i18n";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).history.title };
}

const PAGE = 40;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n } = await searchParams;
  const limit = Math.min(2000, Math.max(PAGE, Number(n) || PAGE));
  const [t, items, catalog, settings] = await Promise.all([getT(), listHistory({ limit: limit + 1 }), getCatalog(), getSettings()]);
  const unit = settings.weightUnit as WeightUnit;
  const names = new Map(catalog.map((e) => [e.id, e.name]));
  const hasMore = items.length > limit;
  const shown = items.slice(0, limit);
  const months = new Map<string, typeof shown>();
  for (const it of shown) {
    const key = it.localDate.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), it]);
  }
  return (
    <>
      <PageHeader title={t.history.title} subtitle={t.history.subtitle} />
      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={History} title={t.history.empty} description={t.history.emptyText} action={<StartWorkoutButton />} />
        </Card>
      ) : (
        <div className="space-y-6">
          {[...months.entries()].map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-2 flex items-baseline justify-between text-sm font-medium text-muted">
                <span>{formatDay(`${month}-01`, "month")}</span>
                <span className="text-xs text-subtle">
                  {plural(t.units.workouts, list.length)}
                </span>
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                {list.map((w) => (
                  <li key={w.id}>
                    <Link href={`/history/${w.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                      <div className="w-11 shrink-0 text-center">
                        <p className="text-xs uppercase text-subtle">{formatDay(w.localDate, "weekday")}</p>
                        <p className="tabular text-lg font-semibold leading-tight">{w.localDate.slice(8)}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{w.name}</p>
                        <p className="tabular truncate text-sm text-muted">
                          {formatDuration(w.durationSeconds)} · {plural(t.units.sets, w.workingSets)} · {formatVolume(w.volumeKg, unit)}
                        </p>
                        <p className="truncate text-xs text-subtle">{w.exerciseIds.map((id) => names.get(id) ?? id).join(", ")}</p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {hasMore ? (
            <div className="flex justify-center">
              <Link href={`/history?n=${limit + PAGE}`} scroll={false} className={buttonClasses("secondary", "md")}>
                {t.history.loadOlder}
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
