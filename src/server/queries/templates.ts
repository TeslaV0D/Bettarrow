import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import * as s from "@/server/db/schema";

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  exerciseIds: string[];
  totalSets: number;
  lastUsed: string | null;
  timesUsed: number;
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const [templates, items] = await Promise.all([
    db
      .select({
        id: s.templates.id,
        name: s.templates.name,
        description: s.templates.description,
        lastUsed: sql<string | null>`(select max(w.local_date)::text from ${s.workouts} w where w.template_id = "templates"."id" and w.status = 'completed')`,
        timesUsed: sql<number>`(select count(*)::int from ${s.workouts} w where w.template_id = "templates"."id" and w.status = 'completed')`,
      })
      .from(s.templates)
      .orderBy(sql`(select max(w.started_at) from ${s.workouts} w where w.template_id = "templates"."id") desc nulls last`, asc(s.templates.name)),
    db
      .select({ templateId: s.templateExercises.templateId, exerciseId: s.templateExercises.exerciseId, targetSets: s.templateExercises.targetSets })
      .from(s.templateExercises)
      .orderBy(asc(s.templateExercises.position)),
  ]);
  return templates.map((t) => {
    const own = items.filter((i) => i.templateId === t.id);
    return { ...t, exerciseIds: own.map((i) => i.exerciseId), totalSets: own.reduce((a, i) => a + i.targetSets, 0) };
  });
}

export async function templateExists(id: string) {
  const [row] = await db.select({ id: s.templates.id }).from(s.templates).where(eq(s.templates.id, id)).limit(1);
  return !!row;
}
