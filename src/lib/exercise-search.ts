/** Client-side exercise search and filtering (pure, works on the full catalog in memory). */

export interface CatalogExercise {
  id: string;
  name: string;
  aliases: string[];
  description: string | null;
  primaryMuscleId: string;
  secondaryMuscleIds: string[];
  equipmentId: string;
  movementPatternId: string | null;
  mechanic: "compound" | "isolation";
  tracking: "reps" | "duration";
  loadMode: "external" | "bodyweight" | "bodyweight_plus" | "bodyweight_minus" | "none";
  bodyweightFactor: number;
  repMin: number | null;
  repMax: number | null;
  restSeconds: number | null;
  isCustom: boolean;
  isFavorite: boolean;
  archived: boolean;
  lastUsed: string | null;
  useCount: number;
}

export interface MuscleRef {
  id: string;
  name: string;
  parentId: string | null;
  region: string;
}

export interface NamedRef {
  id: string;
  name: string;
  category?: string;
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface SearchIndexEntry {
  id: string;
  name: string;
  aliases: string;
  extra: string;
}

export function buildSearchIndex(
  exercises: CatalogExercise[],
  muscles: Map<string, MuscleRef>,
  equipment: Map<string, NamedRef>,
): Map<string, SearchIndexEntry> {
  const index = new Map<string, SearchIndexEntry>();
  for (const e of exercises) {
    const primary = muscles.get(e.primaryMuscleId);
    const parent = primary?.parentId ? muscles.get(primary.parentId) : undefined;
    index.set(e.id, {
      id: e.id,
      name: normalize(e.name),
      aliases: normalize(e.aliases.join(" ")),
      extra: normalize([primary?.name, parent?.name, equipment.get(e.equipmentId)?.name].filter(Boolean).join(" ")),
    });
  }
  return index;
}

/** Relevance score; 0 means no match. Every query term must match name, alias or muscle/equipment. */
export function scoreMatch(entry: SearchIndexEntry, query: string): number {
  const q = normalize(query);
  if (!q) return 1;
  const terms = q.split(" ");
  let score = 0;
  for (const t of terms) {
    if (entry.name.startsWith(t)) score += 6;
    else if (entry.name.split(" ").some((w) => w.startsWith(t))) score += 4;
    else if (entry.name.includes(t)) score += 3;
    else if (entry.aliases.split(" ").some((w) => w.startsWith(t)) || entry.aliases.includes(t)) score += 2;
    else if (entry.extra.includes(t)) score += 1;
    else return 0;
  }
  if (entry.name === q) score += 10;
  return score;
}

export type SortKey = "relevance" | "name" | "muscle" | "recent" | "frequent";

export interface ExerciseFilter {
  query: string;
  primary: string | null; // muscle id or parent group id
  secondary: string | null;
  equipment: string | null;
  pattern: string | null;
  mechanic: "compound" | "isolation" | null;
  favoritesOnly: boolean;
  customOnly: boolean;
  showArchived: boolean;
  sort: SortKey;
}

export const EMPTY_FILTER: ExerciseFilter = {
  query: "",
  primary: null,
  secondary: null,
  equipment: null,
  pattern: null,
  mechanic: null,
  favoritesOnly: false,
  customOnly: false,
  showArchived: false,
  sort: "relevance",
};

export function activeFilterCount(f: ExerciseFilter): number {
  return [f.primary, f.secondary, f.equipment, f.pattern, f.mechanic].filter(Boolean).length + (f.favoritesOnly ? 1 : 0) + (f.customOnly ? 1 : 0) + (f.showArchived ? 1 : 0);
}

/** Muscle ids matched by a filter value (a parent group matches all its children). */
export function expandMuscle(id: string, muscles: Map<string, MuscleRef>): Set<string> {
  const out = new Set<string>([id]);
  for (const m of muscles.values()) if (m.parentId === id) out.add(m.id);
  return out;
}

export function filterExercises(
  exercises: CatalogExercise[],
  filter: ExerciseFilter,
  ctx: { index: Map<string, SearchIndexEntry>; muscles: Map<string, MuscleRef> },
): CatalogExercise[] {
  const primarySet = filter.primary ? expandMuscle(filter.primary, ctx.muscles) : null;
  const secondarySet = filter.secondary ? expandMuscle(filter.secondary, ctx.muscles) : null;
  const scored: { e: CatalogExercise; score: number }[] = [];
  for (const e of exercises) {
    if (e.archived && !filter.showArchived) continue;
    if (filter.favoritesOnly && !e.isFavorite) continue;
    if (filter.customOnly && !e.isCustom) continue;
    if (filter.equipment && e.equipmentId !== filter.equipment) continue;
    if (filter.pattern && e.movementPatternId !== filter.pattern) continue;
    if (filter.mechanic && e.mechanic !== filter.mechanic) continue;
    if (primarySet && !primarySet.has(e.primaryMuscleId)) continue;
    if (secondarySet && !e.secondaryMuscleIds.some((m) => secondarySet.has(m))) continue;
    const entry = ctx.index.get(e.id);
    const score = entry ? scoreMatch(entry, filter.query) : 1;
    if (score === 0) continue;
    scored.push({ e, score });
  }
  const byName = (a: CatalogExercise, b: CatalogExercise) => a.name.localeCompare(b.name, "de");
  const muscleOrder = (id: string) => ctx.muscles.get(id)?.name ?? id;
  const sort = filter.sort === "relevance" && !filter.query.trim() ? "name" : filter.sort;
  scored.sort((x, y) => {
    switch (sort) {
      case "relevance":
        return y.score - x.score || byName(x.e, y.e);
      case "muscle":
        return muscleOrder(x.e.primaryMuscleId).localeCompare(muscleOrder(y.e.primaryMuscleId), "de") || byName(x.e, y.e);
      case "recent":
        return (y.e.lastUsed ?? "").localeCompare(x.e.lastUsed ?? "") || byName(x.e, y.e);
      case "frequent":
        return y.e.useCount - x.e.useCount || byName(x.e, y.e);
      case "name":
      default:
        return byName(x.e, y.e);
    }
  });
  return scored.map((s) => s.e);
}
