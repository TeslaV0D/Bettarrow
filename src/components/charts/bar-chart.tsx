"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { niceScale } from "./use-size";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  tooltip: string;
}

/**
 * Single-series column chart built with HTML (crisp at any size). One hue, rounded data ends
 * anchored at the baseline, recessive grid, per-bar hover/focus tooltip.
 */
export function BarChart({
  data,
  height = 160,
  formatTick = (v) => String(v),
  ariaLabel,
  highlightKey,
  labelEvery,
}: {
  data: BarDatum[];
  height?: number;
  formatTick?: (v: number) => string;
  ariaLabel: string;
  highlightKey?: string;
  labelEvery?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const scale = niceScale(Math.max(0, ...data.map((d) => d.value)));
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 8));
  const gap = data.length > 30 ? 1 : 2;

  return (
    <figure className="w-full" aria-label={ariaLabel}>
      <div className="flex gap-2">
        <div className="relative w-9 shrink-0 text-right text-[11px] text-subtle" style={{ height }} aria-hidden>
          {scale.ticks.map((t) => (
            <span key={t} className="tabular absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / scale.max) * 100}%` }}>
              {formatTick(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }} onMouseLeave={() => setActive(null)}>
          {scale.ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-border/70" style={{ top: `${(1 - t / scale.max) * 100}%` }} aria-hidden />
          ))}
          <div className="absolute inset-0 flex items-end" style={{ gap }}>
            {data.map((d, i) => {
              const h = scale.max ? (d.value / scale.max) * 100 : 0;
              const isActive = active === i;
              return (
                <button
                  key={d.key}
                  type="button"
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center focus:outline-none"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(isActive ? null : i)}
                  aria-label={d.tooltip}
                >
                  <span
                    className={cn(
                      "w-full max-w-10 rounded-t-[4px] transition-colors",
                      d.value > 0 ? (highlightKey === d.key || isActive ? "bg-accent" : "bg-accent/70") : "bg-transparent",
                    )}
                    style={{ height: d.value > 0 ? `max(${h}%, 2px)` : 0 }}
                  />
                  {isActive ? (
                    <span className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-sm border border-border bg-surface-2 px-2 py-1 text-xs text-text shadow-lg">
                      {d.tooltip}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-11 mt-1.5 flex text-[11px] text-subtle" aria-hidden style={{ gap }}>
        {data.map((d, i) => (
          <span key={d.key} className="min-w-0 flex-1 truncate text-center">
            {i % every === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </figure>
  );
}
