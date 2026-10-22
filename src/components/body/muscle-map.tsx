"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Segmented } from "@/components/ui/segmented";
import { BACK, BACK_DETAILS, FRONT, FRONT_DETAILS, SILHOUETTE, type BodyView } from "./body-paths";
import { useT } from "@/components/i18n-provider";

const MIRROR = "matrix(-1 0 0 1 200 0)";

/**
 * Interactive front/back body figure. `intensity` maps muscle ids to 0..1 (0 = not trained).
 * Muscles are focusable buttons; trained muscles are tinted green with intensity-based opacity.
 */
export function MuscleMap({
  intensity,
  labels,
  selected,
  onSelect,
  className,
  compact,
  defaultView = "front",
}: {
  intensity: Record<string, number>;
  labels: Record<string, string>;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  className?: string;
  compact?: boolean;
  defaultView?: BodyView;
}) {
  const [view, setView] = useState<BodyView>(defaultView);
  const t = useT();
  const views: BodyView[] = compact ? ["front", "back"] : [view];

  return (
    <div className={cn("flex flex-col items-center", className)}>
      {!compact ? (
        <Segmented
          size="sm"
          aria-label={t.muscleMap.view}
          value={view}
          onChange={setView}
          options={[
            { value: "front", label: t.muscleMap.front },
            { value: "back", label: t.muscleMap.back },
          ]}
        />
      ) : null}
      <div className={cn("flex w-full justify-center gap-2", !compact && "mt-3")}>
        {views.map((v) => (
          <Figure key={v} view={v} intensity={intensity} labels={labels} selected={selected ?? null} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function Figure({
  view,
  intensity,
  labels,
  selected,
  onSelect,
}: {
  view: BodyView;
  intensity: Record<string, number>;
  labels: Record<string, string>;
  selected: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const muscles = view === "front" ? FRONT : BACK;
  const details = view === "front" ? FRONT_DETAILS : BACK_DETAILS;
  const interactive = !!onSelect;
  const t = useT();

  const shape = (id: string, d: string, mirrored: boolean) => {
    const value = intensity[id] ?? 0;
    const isSel = selected === id;
    const trained = value > 0;
    return (
      <path
        key={`${id}-${mirrored ? "r" : "l"}-${d.length}`}
        d={d}
        transform={mirrored ? MIRROR : undefined}
        fill={trained ? "var(--accent)" : undefined}
        fillOpacity={trained ? 0.28 + 0.72 * Math.min(1, value) : 1}
        stroke={isSel ? "var(--text)" : "var(--bg)"}
        strokeWidth={isSel ? 1.6 : 1}
        strokeLinejoin="round"
        className={cn(!trained && "fill-muscle-idle", interactive && "cursor-pointer")}
        onClick={interactive ? () => onSelect?.(isSel ? null : id) : undefined}
      />
    );
  };

  // Group shapes per muscle so every muscle is a single accessible button.
  const ids = [...new Set(muscles.map((m) => m.id))];
  return (
    <svg viewBox="0 0 200 410" className="h-auto w-full max-w-[200px]" role="group" aria-label={view === "front" ? t.muscleMap.frontView : t.muscleMap.backView}>
      <path d={SILHOUETTE} fill="var(--surface-2)" />
      <path d={SILHOUETTE} transform={MIRROR} fill="var(--surface-2)" />
      {ids.map((id) => {
        const paths = muscles.filter((m) => m.id === id);
        const label = `${labels[id] ?? id} – ${(intensity[id] ?? 0) > 0 ? t.muscleMap.trained : t.muscleMap.notTrained}`;
        return (
          <g
            key={id}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={label}
            aria-pressed={interactive ? selected === id : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect?.(selected === id ? null : id);
                    }
                  }
                : undefined
            }
            className="outline-none focus-visible:[&>path]:stroke-[var(--accent-strong)]"
          >
            <title>{labels[id] ?? id}</title>
            {paths.map((p) => shape(id, p.d, false))}
            {paths.map((p) => shape(id, p.d, true))}
          </g>
        );
      })}
      <path d={details} fill="none" stroke="var(--bg)" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" pointerEvents="none" />
      <path d={details} transform={MIRROR} fill="none" stroke="var(--bg)" strokeWidth="0.8" strokeLinecap="round" opacity="0.7" pointerEvents="none" />
    </svg>
  );
}
