import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { CheckCircle2, Trophy } from "lucide-react";
import { getWorkoutSummary } from "@/server/queries/history";
import { getCatalog, getReferenceData } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkoutActions } from "@/components/history/workout-actions";
import { formatClock, formatDay, formatDuration, formatNumber, formatTime, formatVolume, formatWeight, type WeightUnit } from "@/lib/format";
import { weightedSets } from "@/lib/training";
import { fmt, plural, type Dict } from "@/lib/i18n";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).history.workout };
}

export default async function WorkoutDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ finished?: string }> }) {
  const { id } = await params;
  const { finished } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, summary, catalog, reference, settings] = await Promise.all([getT(), getWorkoutSummary(id), getCatalog(), getReferenceData(), getSettings()]);
  if (!summary) notFound();
  const { workout: w, totals, prs, muscles, perExercise } = summary;
  if (w.status === "active") redirect("/workout");
  const unit = settings.weightUnit as WeightUnit;
  const exById = new Map(catalog.map((e) => [e.id, e]));
  const muscleName = new Map(reference.muscles.map((m) => [m.id, m.name]));
  const maxWeighted = Math.max(1, ...muscles.map((m) => weightedSets(m.contribution, settings.secondaryMuscleWeight)));

  return (
    <div className="mx-auto max-w-4xl">
      {finished ? (
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
          <CheckCircle2 className="size-6 shrink-0 text-accent" aria-hidden />
          <div>
            <p className="font-semibold text-accent">{t.history.finished}</p>
            <p className="text-sm text-muted">{prs.length ? plural(t.history.newPrs, prs.length) : t.history.allSaved}</p>
          </div>
        </div>
      ) : null}
      <PageHeader
        title={w.name}
        subtitle={`${formatDay(w.localDate, "long")} · ${formatTime(w.startedAt, settings.timezone)}${w.endedAt ? `–${formatTime(w.endedAt, settings.timezone)}` : ""}`}
        back={{ href: "/history", label: t.history.title }}
        actions={<WorkoutActions id={w.id} name={w.name} />}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label={t.history.duration} value={formatDuration(summary.durationSeconds)} />
        <Kpi label={t.nav.exercises} value={String(totals.exercises)} />
        <Kpi label={t.dashboard.workingSets} value={String(totals.workingSets)} />
        <Kpi label={t.dashboard.volume} value={formatVolume(totals.volumeKg, unit)} hint={totals.volumeIncomplete ? t.history.incomplete : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {w.exercises.map((e, i) => {
            const meta = exById.get(e.exerciseId);
            const pe = perExercise[i];
            let n = 0;
            return (
              <Card key={e.id}>
                <div className="flex items-start justify-between gap-3 px-4 pt-4">
                  <div className="min-w-0">
                    <Link href={`/exercises/${e.exerciseId}`} className="font-semibold hover:text-accent">
                      {meta?.name ?? e.exerciseId}
                    </Link>
                    <p className="text-sm text-muted">
                      {plural(t.units.workingSets, pe.workingSets)}{pe.volumeKg ? ` · ${formatVolume(pe.volumeKg, unit)}` : ""}
                    </p>
                  </div>
                  {prs.some((p) => p.exerciseId === e.exerciseId) ? (
                    <Badge tone="warning">
                      <Trophy className="size-3" /> PR
                    </Badge>
                  ) : null}
                </div>
                {e.notes ? <p className="mx-4 mt-2 rounded-sm bg-warning-soft/60 px-2 py-1.5 text-sm">{e.notes}</p> : null}
                <table className="mt-2 w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-subtle">
                    <tr>
                      <th className="w-14 px-4 py-1 font-medium">{t.common.set}</th>
                      <th className="py-1 font-medium">{t.history.result}</th>
                      <th className="px-4 py-1 text-right font-medium">{t.history.load}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {e.sets.map((st) => {
                      const label = st.setType === "warmup" ? t.setTypesShort.warmup : String(++n);
                      const result =
                        e.tracking === "duration"
                          ? `${st.weightKg ? `${formatWeight(st.weightKg, unit)} · ` : ""}${st.durationSeconds != null ? formatClock(st.durationSeconds) : "–"}`
                          : e.loadMode === "external"
                            ? `${formatWeight(st.weightKg, unit)} × ${st.reps ?? "–"}`
                            : e.loadMode === "bodyweight_plus"
                              ? `${t.setRow.bwShort}${st.weightKg ? ` + ${formatWeight(st.weightKg, unit)}` : ""} × ${st.reps ?? "–"}`
                              : e.loadMode === "bodyweight_minus"
                                ? `${t.setRow.bwShort}${st.weightKg ? ` − ${formatWeight(st.weightKg, unit)}` : ""} × ${st.reps ?? "–"}`
                                : fmt(t.common.repsShort, { n: st.reps ?? "–" });
                      const extras = [st.rir != null ? `RIR ${formatNumber(st.rir)}` : null, st.rpe != null ? `RPE ${formatNumber(st.rpe)}` : null].filter(Boolean).join(" · ");
                      return (
                        <tr key={st.id} className="border-t border-border/60">
                          <td className="px-4 py-2 font-semibold text-muted" title={t.setTypes[st.setType]}>
                            {label}
                            {st.setType !== "working" && st.setType !== "warmup" ? <span className="ml-1 text-xs text-info">{t.setTypesShort[st.setType]}</span> : null}
                          </td>
                          <td className="py-2">
                            {result}
                            {extras ? <span className="ml-2 text-xs text-subtle">{extras}</span> : null}
                            {st.note ? <span className="block text-xs text-muted">{st.note}</span> : null}
                          </td>
                          <td className="px-4 py-2 text-right text-muted">{e.loadMode !== "none" && st.loadKg != null ? formatWeight(st.loadKg, unit) : "–"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="h-2" />
              </Card>
            );
          })}
          {w.notes ? (
            <Card>
              <CardHeader title={t.history.notes} />
              <CardBody className="whitespace-pre-wrap pt-2 text-sm text-muted">{w.notes}</CardBody>
            </Card>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t.history.prs} description={prs.length ? undefined : t.history.noPrs} />
            {prs.length ? (
              <ul className="space-y-2 p-4 pt-3">
                {prs.map((p, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-md bg-warning-soft/50 px-3 py-2">
                    <Trophy className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium">{exById.get(p.exerciseId)?.name}</p>
                      <p className="text-muted">
                        {t.prs[p.kind]}: <span className="tabular text-text">{prValue(p, unit, t)}</span>
                        {p.previous != null ? <span className="tabular text-subtle">{fmt(t.history.previousValue, { value: prPrev(p, unit, t) })}</span> : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="h-4" />
            )}
          </Card>
          <Card>
            <CardHeader title={t.history.musclesWorked} description={t.history.musclesHint} />
            <ul className="space-y-2.5 p-4 pt-3">
              {muscles.map((m) => {
                const ws = weightedSets(m.contribution, settings.secondaryMuscleWeight);
                return (
                  <li key={m.muscleId}>
                    <div className="flex justify-between text-sm">
                      <span>{muscleName.get(m.muscleId) ?? m.muscleId}</span>
                      <span className="tabular text-muted">
                        {m.contribution.directSets ? m.contribution.directSets : null}
                        {m.contribution.indirectSets ? (
                          <span className="text-subtle">
                            {m.contribution.directSets ? " + " : ""}
                            {fmt(t.muscleMap.indirect, { n: m.contribution.indirectSets })}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${(ws / maxWeighted) * 100}%`, opacity: m.contribution.directSets ? 1 : 0.5 }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
          {w.bodyweightKg ? <p className="px-1 text-xs text-subtle">{fmt(t.history.bodyweightAt, { value: formatWeight(w.bodyweightKg, unit) })}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="text-xs text-warning">{hint}</p> : null}
    </div>
  );
}

function prValue(p: { kind: string; value: number; loadKg: number | null; reps: number | null }, unit: WeightUnit, t: Dict) {
  if (p.kind === "max_reps_at_load") return `${p.reps} × ${formatWeight(p.loadKg, unit)}`;
  if (p.kind === "max_reps") return fmt(t.common.repsShort, { n: p.value });
  if (p.kind === "max_set_volume") return formatVolume(p.value, unit);
  if (p.kind === "e1rm") return `≈ ${formatWeight(p.value, unit)}`;
  return formatWeight(p.value, unit);
}

function prPrev(p: { kind: string; previous: number | null }, unit: WeightUnit, t: Dict) {
  if (p.previous == null) return "";
  if (p.kind === "max_reps_at_load" || p.kind === "max_reps") return fmt(t.common.repsShort, { n: p.previous });
  if (p.kind === "max_set_volume") return formatVolume(p.previous, unit);
  return formatWeight(p.previous, unit);
}
