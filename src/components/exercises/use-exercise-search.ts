"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  buildSearchIndex,
  EMPTY_FILTER,
  filterExercises,
  type CatalogExercise,
  type ExerciseFilter,
  type MuscleRef,
  type NamedRef,
} from "@/lib/exercise-search";

export interface Reference {
  muscles: MuscleRef[];
  equipment: NamedRef[];
  patterns: NamedRef[];
}

export function useReferenceMaps(ref: Reference) {
  return useMemo(
    () => ({
      muscles: new Map(ref.muscles.map((m) => [m.id, m])),
      equipment: new Map(ref.equipment.map((e) => [e.id, e])),
      patterns: new Map(ref.patterns.map((p) => [p.id, p])),
    }),
    [ref],
  );
}

export function useExerciseSearch(catalog: CatalogExercise[], ref: Reference, initial: Partial<ExerciseFilter> = {}) {
  const maps = useReferenceMaps(ref);
  const [filter, setFilter] = useState<ExerciseFilter>({ ...EMPTY_FILTER, ...initial });
  const deferred = useDeferredValue(filter);
  const index = useMemo(() => buildSearchIndex(catalog, maps.muscles, maps.equipment), [catalog, maps]);
  const results = useMemo(() => filterExercises(catalog, deferred, { index, muscles: maps.muscles }), [catalog, deferred, index, maps]);
  const update = (patch: Partial<ExerciseFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const reset = () => setFilter((f) => ({ ...EMPTY_FILTER, query: f.query }));
  return { filter, update, reset, results, maps };
}

/** "Brust · Langhantel" */
export function exerciseSubtitle(e: CatalogExercise, maps: ReturnType<typeof useReferenceMaps>) {
  return [maps.muscles.get(e.primaryMuscleId)?.name, maps.equipment.get(e.equipmentId)?.name].filter(Boolean).join(" · ");
}
