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
import { fmt } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";

interface Entry {
  id: string;
  date: YMD;
  weightKg: number;
  note: string | null;
}

export function BodyweightSection({ entries, unit, today, targetKg, weekStart }: { entries: Entry[]; unit: WeightUnit; today: YMD; targetKg: number | null; weekStart: number }) {
  const router = useRouter();
  const t = useT();
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
      toast.success(existing ? t.bodyweight.updated : t.bodyweight.added);
      setWeight("");
      setNote("");
      router.refresh();
    });
  }

  async function remove(entry: Entry) {
    const res = await deleteBodyweightAction(entry.id);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
    toast(fmt(t.bodyweight.deletedEntry, { date: formatDay(entry.date, "medium") }), {
      action: {
        label: t.common.undoAction,
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
          <Kpi label={t.bodyweight.current} value={latest ? formatWeight(latest.weightKg, unit) : "–"} sub={latest ? formatDay(latest.date, "medium") : t.bodyweight.noEntry} />
          <Kpi label={t.bodyweight.avg7} value={rolling.length ? formatWeight(rolling.at(-1)!.avg, unit) : "–"} />
          <Kpi label={t.bodyweight.days30} value={change30 == null ? "–" : `${change30 > 0 ? "+" : ""}${formatNumber(kgToUnit(change30, unit), 1)} ${unit}`} sub={targetKg && latest ? fmt(t.bodyweight.target, { value: formatWeight(targetKg, unit) }) : undefined} />
        </div>
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">{t.bodyweight.history}</h2>
            <Segmented
              size="sm"
              aria-label={t.bodyweight.range}
              value={range}
              onChange={setRange}
              options={[
                { value: "90", label: t.bodyweight.days90 },
                { value: "365", label: t.bodyweight.year },
                { value: "all", label: t.bodyweight.all },
              ]}
            />
          </div>
          {shown.length >= 2 ? (
            <LineChart
              ariaLabel={t.bodyweight.chartLabel}
              points={shown.map((e) => ({ x: diffDays(e.date, first!), y: kgToUnit(e.weightKg, unit), label: formatDay(e.date, "dayMonth"), tooltip: `${formatWeight(e.weightKg, unit)}${e.note ? ` · ${e.note}` : ""}` }))}
              formatTick={(v) => formatNumber(v, 1)}
            />
          ) : (
            <EmptyState icon={Scale} title={t.bodyweight.tooFew} description={t.bodyweight.tooFewText} />
          )}
        </Card>
        <Card>
          <CardHeader
            title={t.bodyweight.average}
            action={
              <Segmented
                size="sm"
                aria-label={t.bodyweight.timeUnit}
                value={avgUnit}
                onChange={setAvgUnit}
                options={[
                  { value: "week", label: t.calendar.week },
                  { value: "month", label: t.calendar.month },
                ]}
              />
            }
          />
          <table className="mt-3 w-full text-sm">
            <tbody className="tabular">
              {averages.map((a) => (
                <tr key={a.key} className="border-t border-border">
                  <td className="px-4 py-2 sm:px-5">{avgUnit === "week" ? fmt(t.stats.weekFrom, { date: formatDay(a.key, "dayMonth") }) : formatDay(a.key, "month")}</td>
                  <td className="px-4 py-2 text-right sm:px-5">{formatWeight(a.avg, unit)}</td>
                  <td className="px-4 py-2 text-right text-xs text-subtle sm:px-5">{a.count}×</td>
                </tr>
              ))}
            </tbody>
          </table>
          {averages.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">{t.bodyweight.noEntries}</p> : <div className="h-2" />}
        </Card>
      </div>
      <div className="space-y-4">
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-[15px] font-semibold">{t.bodyweight.enterWeight}</h2>
          <form onSubmit={save} className="space-y-3">
            <Field label={t.calendar.date} htmlFor="bw-date">
              <Input id="bw-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={fmt(t.bodyweight.weight, { unit })} htmlFor="bw-weight" hint={existing ? fmt(t.bodyweight.replaces, { value: formatWeight(existing.weightKg, unit) }) : undefined}>
              <Input id="bw-weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={latest ? formatNumber(kgToUnit(latest.weightKg, unit), 1) : ""} aria-invalid={parsed === undefined} />
            </Field>
            <Field label={t.calendar.noteOptional} htmlFor="bw-note">
              <Input id="bw-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t.bodyweight.notePlaceholder} />
            </Field>
            <Button type="submit" variant="primary" className="w-full" loading={pending} disabled={typeof parsed !== "number"}>
              {t.common.save}
            </Button>
          </form>
          <p className="mt-3 text-xs text-subtle">
            {t.bodyweight.snapshotHint}
          </p>
        </Card>
        <Card>
          <CardHeader title={t.bodyweight.entries} description={fmt(t.bodyweight.total, { n: entries.length })} />
          <ul className="mt-2 max-h-96 divide-y divide-border overflow-y-auto border-t border-border">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-4 py-2 text-sm sm:px-5">
                <span className="w-24 shrink-0 text-muted">{formatDay(e.date, "short")}</span>
                <span className="tabular flex-1 font-medium">
                  {formatWeight(e.weightKg, unit)}
                  {e.note ? <span className="ml-2 text-xs font-normal text-subtle">{e.note}</span> : null}
                </span>
                <button type="button" onClick={() => { setDate(e.date); setWeight(formatNumber(kgToUnit(e.weightKg, unit), 2)); setNote(e.note ?? ""); }} className="rounded-sm px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-text">
                  {t.common.edit}
                </button>
                <button type="button" onClick={() => remove(e)} className="grid size-8 place-items-center rounded-sm text-subtle hover:bg-surface-2 hover:text-danger" aria-label={fmt(t.bodyweight.deleteEntry, { date: formatDay(e.date, "medium") })}>
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
