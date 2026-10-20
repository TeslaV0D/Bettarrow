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
import { formatClock, formatDay, formatVolume, formatWeight, type WeightUnit } from "@/lib/format";
import { LOAD_MODE_LABELS, isBodyweightMode, supportsE1RM, type LoadMode, type Tracking } from "@/lib/training";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const ex = await getExercise(decodeURIComponent(id));
  return { title: ex?.name ?? "Übung" };
}

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const [ex, reference, settings] = await Promise.all([getExercise(id), getReferenceData(), getSettings()]);
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
        back={{ href: "/exercises", label: "Übungen" }}
        actions={<ExerciseActions id={ex.id} favorite={ex.isFavorite} archived={!!ex.archivedAt} isCustom={ex.isCustom} isModified={ex.isModified} />}
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {ex.archivedAt ? <Badge tone="warning">Archiviert</Badge> : null}
        {ex.isCustom ? <Badge tone="info">Eigene Übung</Badge> : null}
        <Badge tone="accent">{muscle.get(ex.primaryMuscleId)}</Badge>
        {ex.secondaryMuscleIds.map((m) => (
          <Badge key={m}>{muscle.get(m)}</Badge>
        ))}
        <Badge tone="outline">{ex.mechanic === "compound" ? "Mehrgelenkig" : "Isolation"}</Badge>
        {pattern ? <Badge tone="outline">{pattern}</Badge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {sessions.length ? (
            <>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {hasLoad ? <Record label="Höchstes Gewicht" value={r.maxLoad ? formatWeight(r.maxLoad.value, unit) : "–"} sub={r.maxLoad ? `${r.maxLoad.reps ?? "–"} Wdh. · ${formatDay(r.maxLoad.date, "short")}` : undefined} /> : null}
                {supportsE1RM(tracking, loadMode) ? (
                  <Record label="Geschätztes 1RM" value={r.bestE1rm ? `≈ ${formatWeight(r.bestE1rm.value, unit)}` : "–"} sub={r.bestE1rm ? `aus ${formatWeight(r.bestE1rm.loadKg, unit)} × ${r.bestE1rm.reps}` : "Schätzung (Epley)"} />
                ) : null}
                {hasLoad && tracking === "reps" ? (
                  <Record label="Bestes Satzvolumen" value={r.maxSetVolume ? formatVolume(r.maxSetVolume.value, unit) : "–"} sub={r.maxSetVolume ? `${formatWeight(r.maxSetVolume.loadKg, unit)} × ${r.maxSetVolume.reps}` : undefined} />
                ) : null}
                {tracking === "duration" ? (
                  <Record label="Längste Dauer" value={r.maxDuration ? formatClock(r.maxDuration.value) : "–"} sub={r.maxDuration ? formatDay(r.maxDuration.date, "short") : undefined} />
                ) : (
                  <Record label="Meiste Wdh. (Satz)" value={r.maxReps ? String(r.maxReps.value) : "–"} sub={r.maxReps ? formatDay(r.maxReps.date, "short") : undefined} />
                )}
              </dl>
              <Card className="p-4 sm:p-5">
                <h2 className="mb-3 text-[15px] font-semibold">Verlauf</h2>
                <ProgressChart sessions={sessions} unit={unit} hasLoad={hasLoad} hasE1rm={supportsE1RM(tracking, loadMode)} duration={tracking === "duration"} />
              </Card>
              <Card>
                <CardHeader title="Trainingshistorie" description={`${sessions.length} ${sessions.length === 1 ? "Einheit" : "Einheiten"}`} />
                <ul className="mt-2 divide-y divide-border border-t border-border">
                  {[...sessions].reverse().slice(0, 25).map((s) => (
                    <li key={s.workoutId} className="px-4 py-3 sm:px-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <Link href={`/history/${s.workoutId}`} className="font-medium hover:text-accent">
                          {formatDay(s.date, "medium")}
                        </Link>
                        <span className="tabular text-xs text-muted">
                          {s.workingSets} Sätze{s.volumeKg ? ` · ${formatVolume(s.volumeKg, unit)}` : ""}
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
              <EmptyState icon={LineIcon} title="Noch keine Trainingsdaten" description="Sobald du diese Übung in einem abgeschlossenen Training protokollierst, erscheinen hier Verlauf und Bestleistungen." />
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Eigene Notizen" />
            <CardBody className="pt-3">
              <ExerciseNotes id={ex.id} notes={ex.notes} />
            </CardBody>
          </Card>
          {r.repsByLoad.length > 1 ? (
            <Card>
              <CardHeader title="Wiederholungsrekorde" description="Beste Wdh. je Last" />
              <table className="mt-2 w-full text-sm">
                <tbody className="tabular">
                  {r.repsByLoad.slice(0, 8).map((row) => (
                    <tr key={row.loadKg} className="border-t border-border">
                      <td className="px-4 py-2 sm:px-5">{formatWeight(row.loadKg, unit)}</td>
                      <td className="px-4 py-2 text-right text-muted sm:px-5">{row.reps} Wdh.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Ausführung" />
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
                <dt className="text-subtle">Wiederholungen</dt>
                <dd>{ex.repMin && ex.repMax ? `${ex.repMin}–${ex.repMax}` : "–"}</dd>
                <dt className="text-subtle">Ruhezeit</dt>
                <dd>{ex.restSeconds ? formatClock(ex.restSeconds) : `Standard (${formatClock(settings.defaultRestSeconds)})`}</dd>
                <dt className="text-subtle">Lastberechnung</dt>
                <dd>
                  {LOAD_MODE_LABELS[loadMode]}
                  {isBodyweightMode(loadMode) && ex.bodyweightFactor !== 1 ? ` (Faktor ${String(ex.bodyweightFactor).replace(".", ",")})` : ""}
                </dd>
                <dt className="text-subtle">Erfassung</dt>
                <dd>{tracking === "duration" ? "Zeit" : "Wiederholungen"}</dd>
                {ex.aliases.length ? (
                  <>
                    <dt className="text-subtle">Auch bekannt als</dt>
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
