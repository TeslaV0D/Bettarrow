import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart as LineIcon } from "lucide-react";
import { db } from "@/server/db";
import { getExercise, getReferenceData } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { getExerciseProgress } from "@/server/services/stats";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ExerciseActions, ExerciseNotes } from "@/components/exercises/exercise-actions";
import { ProgressChart } from "@/components/exercises/progress-chart";
import { formatClock, formatDay, formatNumber, formatVolume, formatWeight, type WeightUnit } from "@/lib/format";
import { isBodyweightMode, supportsE1RM, type LoadMode, type Tracking } from "@/lib/training";
import { fmt, plural } from "@/lib/i18n";
import { getT } from "@/server/i18n";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const [t, ex] = await Promise.all([getT(), getExercise(decodeURIComponent(id))]);
  return { title: ex?.name ?? t.common.exercise };
}

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const [t, ex, reference, settings] = await Promise.all([getT(), getExercise(id), getReferenceData(), getSettings()]);
  if (!ex) notFound();
  const progress = await getExerciseProgress(db, id, { bodyweightInVolume: settings.bodyweightInVolume });
  const unit = settings.weightUnit as WeightUnit;
  const muscle = new Map(reference.muscles.map((m) => [m.id, m.name]));
  const equipment = reference.equipment.find((e) => e.id === ex.equipmentId)?.name;
  const pattern = reference.patterns.find((p) => p.id === ex.movementPatternId)?.name;
  const loadMode = ex.loadMode as LoadMode;
  const tracking = ex.tracking as Tracking;
  const hasLoad = loadMode !== "none" && loadMode !== "bodyweight";
  const r = progress.records;
  const sessions = progress.sessions;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={ex.name}
        subtitle={[muscle.get(ex.primaryMuscleId), equipment].filter(Boolean).join(" · ")}
        back={{ href: "/exercises", label: t.exercises.title }}
        actions={<ExerciseActions id={ex.id} favorite={ex.isFavorite} archived={!!ex.archivedAt} isCustom={ex.isCustom} isModified={ex.isModified} />}
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {ex.archivedAt ? <Badge tone="warning">{t.exercises.archived}</Badge> : null}
        {ex.isCustom ? <Badge tone="info">{t.exercises.customExercise}</Badge> : null}
        <Badge tone="accent">{muscle.get(ex.primaryMuscleId)}</Badge>
        {ex.secondaryMuscleIds.map((m) => (
          <Badge key={m}>{muscle.get(m)}</Badge>
        ))}
        <Badge tone="outline">{ex.mechanic === "compound" ? t.filters.compound : t.filters.isolation}</Badge>
        {pattern ? <Badge tone="outline">{pattern}</Badge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {sessions.length ? (
            <>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {hasLoad ? <Record label={t.exercises.maxLoad} value={r.maxLoad ? formatWeight(r.maxLoad.value, unit) : "–"} sub={r.maxLoad ? fmt(t.exercises.repsOnDate, { reps: r.maxLoad.reps ?? "–", date: formatDay(r.maxLoad.date, "short") }) : undefined} /> : null}
                {supportsE1RM(tracking, loadMode) ? (
                  <Record label={t.exercises.e1rm} value={r.bestE1rm ? `≈ ${formatWeight(r.bestE1rm.value, unit)}` : "–"} sub={r.bestE1rm ? fmt(t.exercises.e1rmFrom, { weight: formatWeight(r.bestE1rm.loadKg, unit), reps: r.bestE1rm.reps }) : t.exercises.e1rmEstimate} />
                ) : null}
                {hasLoad && tracking === "reps" ? (
                  <Record label={t.exercises.bestSetVolume} value={r.maxSetVolume ? formatVolume(r.maxSetVolume.value, unit) : "–"} sub={r.maxSetVolume ? `${formatWeight(r.maxSetVolume.loadKg, unit)} × ${r.maxSetVolume.reps}` : undefined} />
                ) : null}
                {tracking === "duration" ? (
                  <Record label={t.exercises.longestDuration} value={r.maxDuration ? formatClock(r.maxDuration.value) : "–"} sub={r.maxDuration ? formatDay(r.maxDuration.date, "short") : undefined} />
                ) : (
                  <Record label={t.exercises.mostReps} value={r.maxReps ? String(r.maxReps.value) : "–"} sub={r.maxReps ? formatDay(r.maxReps.date, "short") : undefined} />
                )}
              </dl>
              <Card className="p-4 sm:p-5">
                <h2 className="mb-3 text-[15px] font-semibold">{t.exercises.history}</h2>
                <ProgressChart sessions={sessions} unit={unit} hasLoad={hasLoad} hasE1rm={supportsE1RM(tracking, loadMode)} duration={tracking === "duration"} />
              </Card>
              <Card>
                <CardHeader title={t.exercises.sessionHistory} description={plural(t.exercises.sessions, sessions.length)} />
                <ul className="mt-2 divide-y divide-border border-t border-border">
                  {[...sessions].reverse().slice(0, 25).map((s) => (
                    <li key={s.workoutId} className="px-4 py-3 sm:px-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link href={`/history/${s.workoutId}`} className="font-medium hover:text-accent">
                          {formatDay(s.date, "medium")}
                        </Link>
                        <span className="tabular text-xs text-muted">
                          {plural(t.units.sets, s.workingSets)}{s.volumeKg ? ` · ${formatVolume(s.volumeKg, unit)}` : ""}
                        </span>
                      </div>
                      <p className="tabular mt-1 text-sm text-muted">
                        {s.sets
                          .filter((x) => x.completed)
                          .map((x) =>
                            s.tracking === "duration"
                              ? formatClock(x.durationSeconds ?? 0)
                              : s.loadMode === "external"
                                ? `${formatWeight(x.weightKg, unit).replace(` ${unit}`, "")}×${x.reps ?? "–"}`
                                : isBodyweightMode(s.loadMode) && x.weightKg
                                  ? `${s.loadMode === "bodyweight_minus" ? "−" : "+"}${formatWeight(x.weightKg, unit).replace(` ${unit}`, "")}×${x.reps ?? "–"}`
                                  : `${x.reps ?? "–"}`,
                          )
                          .join("  ·  ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <Card>
              <EmptyState icon={LineIcon} title={t.exercises.noData} description={t.exercises.noDataText} />
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t.exerciseForm.ownNotes} />
            <CardBody className="pt-3">
              <ExerciseNotes id={ex.id} notes={ex.notes} />
            </CardBody>
          </Card>
          {r.repsByLoad.length > 1 ? (
            <Card>
              <CardHeader title={t.exercises.repRecords} description={t.exercises.repRecordsHint} />
              <table className="mt-2 w-full text-sm">
                <tbody className="tabular">
                  {r.repsByLoad.slice(0, 8).map((row) => (
                    <tr key={row.loadKg} className="border-t border-border">
                      <td className="px-4 py-2 sm:px-5">{formatWeight(row.loadKg, unit)}</td>
                      <td className="px-4 py-2 text-right text-muted sm:px-5">{fmt(t.common.repsShort, { n: row.reps })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
          <Card>
            <CardHeader title={t.exercises.execution} />
            <CardBody className="space-y-3 pt-3 text-sm">
              {ex.description ? <p className="text-muted">{ex.description}</p> : null}
              {ex.instructions ? (
                <ol className="list-decimal space-y-1.5 pl-5">
                  {ex.instructions.split("\n").filter(Boolean).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              ) : null}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
                <dt className="text-subtle">{t.exercises.reps}</dt>
                <dd>{ex.repMin && ex.repMax ? `${ex.repMin}–${ex.repMax}` : "–"}</dd>
                <dt className="text-subtle">{t.exercises.rest}</dt>
                <dd>{ex.restSeconds ? formatClock(ex.restSeconds) : fmt(t.exercises.defaultRest, { time: formatClock(settings.defaultRestSeconds) })}</dd>
                <dt className="text-subtle">{t.exercises.loadCalc}</dt>
                <dd>
                  {t.loadModes[loadMode]}
                  {isBodyweightMode(loadMode) && ex.bodyweightFactor !== 1 ? fmt(t.exercises.factor, { value: formatNumber(ex.bodyweightFactor, 3) }) : ""}
                </dd>
                <dt className="text-subtle">{t.exercises.tracking}</dt>
                <dd>{tracking === "duration" ? t.common.time : t.exercises.reps}</dd>
                {ex.aliases.length ? (
                  <>
                    <dt className="text-subtle">{t.exercises.aka}</dt>
                    <dd>{ex.aliases.join(", ")}</dd>
                  </>
                ) : null}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Record({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-lg font-semibold tracking-tight">{value}</dd>
      {sub ? <dd className="text-xs text-subtle">{sub}</dd> : null}
    </div>
  );
}
