import Link from "next/link";
import { ChevronRight, ClipboardList, Dumbbell, History, Trophy } from "lucide-react";
import { getDashboardData } from "@/server/queries/dashboard";
import { getCatalog, getReferenceData } from "@/server/queries/exercises";
import { getProfile, getSettings } from "@/server/queries/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { TodayCard } from "@/components/dashboard/today-card";
import { MusclePanel } from "@/components/dashboard/muscle-panel";
import { cn } from "@/lib/cn";
import { dayState } from "@/lib/calendar";
import { eachDay, hourIn, todayIn } from "@/lib/dates";
import { formatDay, formatDuration, formatVolume, formatWeight, relativeDay, type WeightUnit } from "@/lib/format";
import { PR_LABELS } from "@/lib/training";

export default async function DashboardPage() {
  const settings = await getSettings();
  const today = todayIn(settings.timezone);
  const [data, profile, catalog, reference] = await Promise.all([getDashboardData(today), getProfile(), getCatalog(), getReferenceData()]);
  const unit = settings.weightUnit as WeightUnit;
  const exName = new Map(catalog.map((e) => [e.id, e.name]));
  const labels = Object.fromEntries(reference.muscles.map((m) => [m.id, m.name]));
  const hour = hourIn(settings.timezone);
  const greeting = hour < 5 ? "Gute Nacht" : hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";

  const todayEntries = data.calendar.entries.filter((e) => e.date === today);
  const todayWorkouts = data.calendar.workouts.filter((w) => w.localDate === today);
  const weekDays = eachDay(data.weekFrom, data.weekTo);
  const t = data.week.totals;
  const prGroups = [...new Map(data.prs.map((p) => [`${p.workoutId}:${p.exerciseId}`, data.prs.filter((x) => x.workoutId === p.workoutId && x.exerciseId === p.exerciseId)])).values()];

  return (
    <div className="space-y-4">
      <header className="mb-2">
        <p className="text-sm text-muted">{formatDay(today, "long")}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-[28px]">
          {greeting}
          {profile.name ? `, ${profile.name}` : ""}
        </h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <TodayCard
            info={{
              date: today,
              planned: todayEntries.filter((e) => e.kind === "workout" && e.status === "planned").map((e) => ({ id: e.id, title: e.title })),
              rest: todayEntries.find((e) => e.kind === "rest") ? { id: todayEntries.find((e) => e.kind === "rest")!.id } : null,
              done: todayWorkouts.filter((w) => w.status === "completed").map((w) => ({ id: w.id, name: w.name })),
              active: data.active,
            }}
          />

          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">Diese Woche</h2>
              <Link href="/calendar?view=week" className="text-sm text-muted hover:text-text">
                Kalender
              </Link>
            </div>
            <ol className="mt-3 grid grid-cols-7 gap-1.5" aria-label="Wochenübersicht">
              {weekDays.map((d) => {
                const entries = data.calendar.entries.filter((e) => e.date === d);
                const done = data.calendar.workouts.filter((w) => w.localDate === d && w.status === "completed").length;
                const st = dayState(d, today, entries, done);
                const label = { trained: "trainiert", planned: "geplant", missed: "verpasst", rest: "Ruhetag", empty: "frei" }[st];
                return (
                  <li key={d} className="flex flex-col items-center gap-1.5" aria-label={`${formatDay(d, "weekday")}: ${label}`}>
                    <span className={cn("text-xs", d === today ? "font-semibold text-text" : "text-subtle")}>{formatDay(d, "weekday")}</span>
                    <span
                      className={cn(
                        "grid size-9 place-items-center rounded-full text-sm tabular",
                        st === "trained" && "bg-accent font-semibold text-accent-ink",
                        st === "planned" && "border border-accent/70 text-accent",
                        st === "missed" && "border border-warning/70 text-warning",
                        st === "rest" && "bg-surface-3 text-muted",
                        st === "empty" && "text-subtle",
                        d === today && st !== "trained" && "ring-1 ring-text/60",
                      )}
                    >
                      {Number(d.slice(8))}
                    </span>
                  </li>
                );
              })}
            </ol>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-border rounded-md border border-border">
              <Stat label="Trainings" value={String(t.sessions)} previous={String(data.lastWeek.sessions)} />
              <Stat label="Arbeitssätze" value={String(t.workingSets)} previous={String(data.lastWeek.workingSets)} />
              <Stat label="Volumen" value={formatVolume(t.volumeKg, unit)} previous={formatVolume(data.lastWeek.volumeKg, unit)} />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Letzte Trainings"
              action={
                <Link href="/history" className="text-sm text-muted hover:text-text">
                  Alle
                </Link>
              }
            />
            {data.recent.length ? (
              <ul className="mt-2 divide-y divide-border border-t border-border">
                {data.recent.map((w) => (
                  <li key={w.id}>
                    <Link href={`/history/${w.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{w.name}</p>
                        <p className="tabular truncate text-sm text-muted">
                          {relativeDay(w.localDate, today)} · {formatDuration(w.durationSeconds)} · {w.workingSets} Sätze · {formatVolume(w.volumeKg, unit)}
                        </p>
                      </div>
                      <ChevronRight className="size-4 text-subtle" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 pt-2 text-sm text-muted">Noch keine abgeschlossenen Trainings.</p>
            )}
          </Card>

          <nav className="grid grid-cols-3 gap-2 lg:hidden" aria-label="Bibliothek">
            <QuickLink href="/templates" icon={<ClipboardList className="size-5" />} label="Vorlagen" />
            <QuickLink href="/exercises" icon={<Dumbbell className="size-5" />} label="Übungen" />
            <QuickLink href="/history" icon={<History className="size-5" />} label="Verlauf" />
          </nav>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Muskeln diese Woche</h2>
            <MusclePanel
              stats={data.week.muscles.map((m) => ({ muscleId: m.muscleId, directSets: m.directSets, indirectSets: m.indirectSets, weightedSets: m.weightedSets }))}
              exercises={data.weekExercises.map((e) => ({ ...e, name: exName.get(e.exerciseId) ?? e.exerciseId }))}
              labels={labels}
              targetSets={10}
            />
            {data.lastTrained.length ? (
              <ul className="mt-4 space-y-1.5 text-sm">
                {data.lastTrained.slice(0, 6).map((m) => (
                  <li key={m.groupId} className="flex justify-between">
                    <span>{labels[m.groupId] ?? m.groupId}</span>
                    <span className="text-muted">{relativeDay(m.date, today)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Neue Bestleistungen" description="Letzte 30 Tage" />
            {prGroups.length ? (
              <ul className="space-y-2 p-4 pt-3 sm:px-5">
                {prGroups.map((group) => {
                  const p = group[0];
                  return (
                    <li key={`${p.workoutId}-${p.exerciseId}`}>
                      <Link href={`/exercises/${p.exerciseId}`} className="flex items-start gap-3 rounded-md px-1 py-1 hover:bg-surface-2">
                        <Trophy className="mt-0.5 size-4 shrink-0 text-warning" />
                        <span className="min-w-0 flex-1">
                          <span className="flex justify-between gap-2 text-sm font-medium">
                            <span className="truncate">{exName.get(p.exerciseId)}</span>
                            <span className="shrink-0 text-xs font-normal text-subtle">{relativeDay(p.date, today)}</span>
                          </span>
                          {group.map((pr) => (
                            <span key={pr.kind} className="block text-xs text-muted">
                              {PR_LABELS[pr.kind]}:{" "}
                              <span className="tabular text-text">
                                {pr.kind === "max_reps" || pr.kind === "max_reps_at_load"
                                  ? `${pr.reps} Wdh.${pr.loadKg && pr.kind === "max_reps_at_load" ? ` × ${formatWeight(pr.loadKg, unit)}` : ""}`
                                  : pr.kind === "max_set_volume"
                                    ? formatVolume(pr.value, unit)
                                    : `${pr.kind === "e1rm" ? "≈ " : ""}${formatWeight(pr.value, unit)}`}
                              </span>
                            </span>
                          ))}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 pb-5 pt-2 text-sm text-muted">Keine neuen Rekorde in den letzten 30 Tagen.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, previous }: { label: string; value: string; previous: string }) {
  return (
    <div className="px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-lg font-semibold tracking-tight">{value}</dd>
      <dd className="tabular text-xs text-subtle">Vorwoche: {previous}</dd>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-surface py-3 text-sm text-muted hover:text-text">
      {icon}
      {label}
    </Link>
  );
}
