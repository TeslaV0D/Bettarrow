import type { Dict } from "./index";

/**
 * Built-in muscle groups, equipment and movement patterns are stored with German names.
 * They are translated by id at read time; user-created entries keep the name they were given.
 */
export function refName(table: Record<string, string>, id: string, fallback: string): string {
  return Object.hasOwn(table, id) ? table[id] : fallback;
}

export function localizeReference<
  M extends { id: string; name: string },
  E extends { id: string; name: string; category?: string },
  P extends { id: string; name: string },
>(t: Dict, ref: { muscles: M[]; equipment: E[]; patterns: P[] }) {
  return {
    muscles: ref.muscles.map((m) => ({ ...m, name: refName(t.muscles, m.id, m.name) })),
    equipment: ref.equipment.map((e) => ({
      ...e,
      name: refName(t.equipment, e.id, e.name),
      ...(e.category != null ? { category: refName(t.equipmentCategories, e.category, e.category) } : {}),
    })),
    patterns: ref.patterns.map((p) => ({ ...p, name: refName(t.patterns, p.id, p.name) })),
  };
}
