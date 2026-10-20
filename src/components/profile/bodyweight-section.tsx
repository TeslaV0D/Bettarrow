"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Scale, Trash2 } from "lucide-react";
import { changeOver, periodAverages, rollingAverage } from "@/lib/bodyweight";
import { diffDays, type YMD } from "@/lib/dates";
import { formatDay, formatNumber, formatWeight, kgToUnit, unitToKg, type WeightUnit } from "@/lib/format";
import { parseDecimal } from "@/lib/workout-reducer";
import { deleteBodyweightAction, saveBodyweightAction } from "@/server/actions/profile";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { LineChart } from "@/components/charts/line-chart";

interface Entry {
  id: string;
  date: YMD;
  weightKg: number;
  note: string | null;
}

export function BodyweightSection({ entries, unit, today, targetKg, weekStart }: { entries: Entry[]; unit: WeightUnit; today: YMD; targetKg: number | null; weekStart: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [note, setNote] = useState("");
  const [range, setRange] = useState<"90" | "365" | "all">("90");
  const [avgUnit, setAvgUnit] = useState<"week" | "month">("week");
  const parsed = parseDecimal(weight);
  const existing = entries.find((e) => e.date === date);
  const latest = entries.at(-1);

  const shown = useMemo(() => {
    if (range === "all") return entries;
    const days = Number(range);
    return entries.filter((e) => diffDays(today, e.date) < days);
  }, [entries, range, today]);
  const rolling = useMemo(() => rollingAverage(shown, 7), [shown]);
  const averages = useMemo(() => periodAverages(entries, avgUnit, weekStart).reverse().slice(0, 8), [entries, avgUnit, weekStart]);
  const first = shown[0]?.date;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (typeof parsed !== "number") return;
    start(async () => {
      const res = await saveBodyweightAction({ date, weightKg: unitToKg(parsed, unit), note: note.trim() || null });
      if (!res.ok) return void toast.error(res.error);
      toast.success(existing ? "Eintrag aktualisiert" : "Gewicht eingetragen");
      setWeight("");
      setNote("");
      router.refresh();
    });
  }

  async function remove(entry: Entry) {
    const res = await deleteBodyweightAction(entry.id);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
    toast(`Eintrag vom ${formatDay(entry.date, "medium")} gelöscht`, {
      action: {
        label: "Rückgängig",
        onClick: async () => {
          const r = await saveBodyweightAction(res.data);
          if (r.ok) router.refresh();
          else toast.error(r.error);
        },
      },
    });
  }

  const change30 = changeOver(entries, 30);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Kpi label="Aktuell" value={latest ? formatWeight(latest.weightKg, unit) : "–"} sub={latest ? formatDay(latest.date, "medium") : "kein Eintrag"} />
          <Kpi label="Ø 7 Tage" value={rolling.length ? formatWeight(rolling.at(-1)!.avg, unit) : "–"} />
          <Kpi label="30 Tage" value={change30 == null ? "–" : `${change30 > 0 ? "+" : ""}${formatNumber(kgToUnit(change30, unit), 1)} ${unit}`} sub={targetKg && latest ? `Ziel: ${formatWeight(targetKg, unit)}` : undefined} />
        </div>
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">Verlauf</h2>
            <Segmented
              size="sm"
              aria-label="Zeitraum"
              value={range}
              onChange={setRange}
              options={[
                { value: "90", label: "90 Tage" },
                { value: "365", label: "1 Jahr" },
                { value: "all", label: "Gesamt" },
              ]}
            />
          </div>
          {shown.length >= 2 ? (
            <LineChart
              ariaLabel="Körpergewicht"
              points={shown.map((e) => ({ x: diffDays(e.date, first!), y: kgToUnit(e.weightKg, unit), label: formatDay(e.date, "dayMonth"), tooltip: `${formatWeight(e.weightKg, unit)}${e.note ? ` · ${e.note}` : ""}` }))}
              formatTick={(v) => formatNumber(v, 1)}
            />
          ) : (
            <EmptyState icon={Scale} title="Zu wenige Einträge" description="Ab zwei Einträgen im Zeitraum siehst du hier deinen Verlauf." />
          )}
        </Card>
        <Card>
          <CardHeader
            title="Durchschnitt"
            action={
              <Segmented
                size="sm"
                aria-label="Zeiteinheit"
                value={avgUnit}
                onChange={setAvgUnit}
                options={[
                  { value: "week", label: "Woche" },
                  { value: "month", label: "Monat" },
                ]}
              />
            }
          />
          <table className="mt-3 w-full text-sm">
            <tbody className="tabular">
              {averages.map((a) => (
                <tr key={a.key} className="border-t border-border">
                  <td className="px-4 py-2 sm:px-5">{avgUnit === "week" ? `Woche ab ${formatDay(a.key, "dayMonth")}` : formatDay(a.key, "month")}</td>
                  <td className="px-4 py-2 text-right sm:px-5">{formatWeight(a.avg, unit)}</td>
                  <td className="px-4 py-2 text-right text-xs text-subtle sm:px-5">{a.count}×</td>
                </tr>
              ))}
            </tbody>
          </table>
          {averages.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">Noch keine Einträge.</p> : <div className="h-2" />}
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Gewicht eintragen</h2>
          <form onSubmit={save} className="space-y-3">
            <Field label="Datum" htmlFor="bw-date">
              <Input id="bw-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={`Gewicht (${unit})`} htmlFor="bw-weight" hint={existing ? `Ersetzt den Eintrag vom selben Tag (${formatWeight(existing.weightKg, unit)}).` : undefined}>
              <Input id="bw-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={latest ? formatNumber(kgToUnit(latest.weightKg, unit), 1) : ""} aria-invalid={parsed === undefined} />
            </Field>
            <Field label="Notiz (optional)" htmlFor="bw-note">
              <Input id="bw-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="z. B. morgens, nüchtern" />
            </Field>
            <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={typeof parsed !== "number"}>
              Speichern
            </Button>
          </form>
          <p className="mt-3 text-xs text-subtle">
            Trainings speichern das Körpergewicht zum Trainingszeitpunkt. Spätere Änderungen verändern alte Trainingsdaten nicht.
          </p>
        </Card>
        <Card>
          <CardHeader title="Einträge" description={`${entries.length} insgesamt`} />
          <ul className="mt-2 max-h-96 divide-y divide-border overflow-y-auto border-t border-border">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-4 py-2 text-sm sm:px-5">
                <span className="w-24 shrink-0 text-muted">{formatDay(e.date, "short")}</span>
                <span className="tabular flex-1 font-medium">
                  {formatWeight(e.weightKg, unit)}
                  {e.note ? <span className="ml-2 text-xs font-normal text-subtle">{e.note}</span> : null}
                </span>
                <button type="button" onClick={() => { setDate(e.date); setWeight(formatNumber(kgToUnit(e.weightKg, unit), 2)); setNote(e.note ?? ""); }} className="rounded-sm px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text">
                  Bearbeiten
                </button>
                <button type="button" onClick={() => remove(e)} className="grid size-8 place-items-center rounded-sm text-subtle hover:bg-surface-2 hover:text-danger" aria-label={`Eintrag vom ${formatDay(e.date, "medium")} löschen`}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-3 sm:px-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-0.5 text-lg font-semibold tracking-tight">{value}</p>
      {sub ? <p className="truncate text-xs text-subtle">{sub}</p> : null}
    </div>
  );
}
