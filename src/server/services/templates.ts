import { asc, eq, inArray } from "drizzle-orm";
import type { Db, DbOrTx } from "@/server/db/types";
import * as s from "@/server/db/schema";
import { templateInputSchema, type TemplateInput } from "@/lib/template-schema";

export type TemplateRow = typeof s.templates.$inferSelect;
export type TemplateItemRow = typeof s.templateExercises.$inferSelect;

export async function getTemplate(db: DbOrTx, id: string): Promise<(TemplateRow & { items: TemplateItemRow[] }) | null> {
  const [t] = await db.select().from(s.templates).where(eq(s.templates.id, id)).limit(1);
  if (!t) return null;
  const items = await db.select().from(s.templateExercises).where(eq(s.templateExercises.templateId, id)).orderBy(asc(s.templateExercises.position));
  return { ...t, items };
}

/**
 * Creates or replaces a template. Template items are fully replaced; workouts never reference
 * template items, so editing a template can not change any training history.
 */
export async function saveTemplate(db: Db, id: string | null, raw: TemplateInput): Promise<string> {
  const data = templateInputSchema.parse(raw);
  return db.transaction(async (tx) => {
    const ids = [...new Set(data.items.map((i) => i.exerciseId))];
    if (ids.length) {
      const found = await tx.select({ id: s.exercises.id }).from(s.exercises).where(inArray(s.exercises.id, ids));
      if (found.length !== ids.length) throw new Error("Unbekannte Übung in der Vorlage");
    }
    let templateId = id;
    if (templateId) {
      const res = await tx
        .update(s.templates)
        .set({ name: data.name, description: data.description || null, notes: data.notes || null, updatedAt: new Date() })
        .where(eq(s.templates.id, templateId))
        .returning({ id: s.templates.id });
      if (!res.length) throw new Error("Vorlage nicht gefunden");
      await tx.delete(s.templateExercises).where(eq(s.templateExercises.templateId, templateId));
    } else {
      const [row] = await tx
        .insert(s.templates)
        .values({ name: data.name, description: data.description || null, notes: data.notes || null })
        .returning({ id: s.templates.id });
      templateId = row.id;
    }
    if (data.items.length) {
      await tx.insert(s.templateExercises).values(
        data.items.map((it, i) => ({
          templateId: templateId!,
          exerciseId: it.exerciseId,
          position: i,
          targetSets: it.targetSets,
          repMin: it.repMin,
          repMax: it.repMax,
          restSeconds: it.restSeconds,
          notes: it.notes || null,
        })),
      );
    }
    return templateId!;
  });
}

export async function duplicateTemplate(db: Db, id: string): Promise<string> {
  const t = await getTemplate(db, id);
  if (!t) throw new Error("Vorlage nicht gefunden");
  return saveTemplate(db, null, {
    name: `${t.name} (Kopie)`.slice(0, 80),
    description: t.description,
    notes: t.notes,
    items: t.items.map((i) => ({ exerciseId: i.exerciseId, targetSets: i.targetSets, repMin: i.repMin, repMax: i.repMax, restSeconds: i.restSeconds, notes: i.notes })),
  });
}

/** Deletes a template. Workouts keep their name and data; their template reference is cleared. */
export async function deleteTemplate(db: Db, id: string): Promise<boolean> {
  const res = await db.delete(s.templates).where(eq(s.templates.id, id)).returning({ id: s.templates.id });
  return res.length > 0;
}
