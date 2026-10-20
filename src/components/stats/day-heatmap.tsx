import { cn } from "@/lib/cn";
import { addDays, diffDays, startOfWeek, type YMD } from "@/lib/dates";
import { formatDay } from "@/lib/format";

/** Training-day grid (weeks as columns). One hue; days with sessions are filled. */
export function DayHeatmap({ days, from, to, weekStart }: { days: { date: YMD; sessions: number }[]; from: YMD; to: YMD; weekStart: number }) {
  const start = startOfWeek(diffDays(to, from) > 7 * 53 ? addDays(to, -7 * 53) : from, weekStart);
  const weeks = Math.floor(diffDays(to, start) / 7) + 1;
  const map = new Map(days.map((d) => [d.date, d.sessions]));
  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="inline-grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: "repeat(7, 12px)" }} role="img" aria-label={`Trainingstage vom ${formatDay(start, "medium")} bis ${formatDay(to, "medium")}`}>
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const d = addDays(start, i);
          if (d > to) return <span key={d} />;
          const n = map.get(d) ?? 0;
          return (
            <span
              key={d}
              title={`${formatDay(d, "medium")}: ${n ? `${n} Training${n > 1 ? "s" : ""}` : "kein Training"}`}
              className={cn("size-3 rounded-[3px]", d < from ? "bg-transparent" : n > 1 ? "bg-accent" : n === 1 ? "bg-accent/75" : "bg-surface-3")}
            />
          );
        })}
      </div>
    </div>
  );
}
