"use client";

import Link from "next/link";
import { useState } from "react";
import { MuscleMap } from "@/components/body/muscle-map";
import { formatNumber } from "@/lib/format";

export interface MuscleStat {
  muscleId: string;
  directSets: number;
  indirectSets: number;
  weightedSets: number;
}

export interface PanelExercise {
  exerciseId: string;
  name: string;
  workingSets: number;
  primaryMuscleId: string;
  secondaryMuscleIds: string[];
}

/** Weekly muscle map with a detail list for the selected muscle. */
export function MusclePanel({
  stats,
  exercises,
  labels,
  targetSets,
}: {
  stats: MuscleStat[];
  exercises: PanelExercise[];
  labels: Record<string, string>;
  targetSets: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const intensity = Object.fromEntries(stats.map((m) => [m.muscleId, Math.min(1, m.weightedSets / targetSets)]));
  const sel = selected ? stats.find((m) => m.muscleId === selected) : null;
  const related = selected ? exercises.filter((e) => e.primaryMuscleId === selected || e.secondaryMuscleIds.includes(selected)) : [];

  return (
    <div>
      <MuscleMap intensity={intensity} labels={labels} selected={selected} onSelect={setSelected} />
      <div className="mt-3 min-h-20 rounded-md bg-surface-2 p-3 text-sm" aria-live="polite">
        {selected ? (
          <>
            <p className="font-medium">{labels[selected] ?? selected}</p>
            {sel ? (
              <p className="text-muted">
                {sel.directSets} direkte Sätze{sel.indirectSets ? `, ${sel.indirectSets} indirekt` : ""} · gewichtet {formatNumber(sel.weightedSets)}
              </p>
            ) : (
              <p className="text-muted">Diese Woche nicht trainiert.</p>
            )}
            {related.length ? (
              <ul className="mt-2 space-y-1">
                {related.map((e) => (
                  <li key={e.exerciseId} className="flex justify-between gap-2">
                    <Link href={`/exercises/${e.exerciseId}`} className="truncate hover:text-accent">
                      {e.name}
                    </Link>
                    <span className="tabular shrink-0 text-muted">
                      {e.workingSets} {e.primaryMuscleId === selected ? "Sätze" : "Sätze (indirekt)"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-muted">Tippe auf einen Muskel, um die Sätze und Übungen dieser Woche zu sehen.</p>
        )}
      </div>
    </div>
  );
}
