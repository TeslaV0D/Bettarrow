"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { isYmd, addDays } from "@/lib/dates";
import { getToday } from "@/server/queries/settings";
import { createRule, endRule, moveEntry, planEntry, restoreEntryStatus, setEntryStatus, updateEntry } from "@/server/services/calendar";
import { run, UserError } from "./_util";

const ymd = z.string().refine(isYmd, "Ungültiges Datum");
const entryId = z.string().min(1).max(100);
const kind = z.enum(["workout", "rest"]);

function done() {
  revalidatePath("/", "layout");
}

function userErrors<T>(fn: () => Promise<T>) {
  return fn().catch((err) => {
    if (err instanceof Error && /nicht gefunden|können nicht/.test(err.message)) throw new UserError(err.message);
    throw err;
  });
}

export async function planEntryAction(input: { date: string; kind: "workout" | "rest"; templateId?: string | null; title?: string | null; notes?: string | null }) {
  return run(async () => {
    const data = z
      .object({ date: ymd, kind, templateId: z.uuid().nullish(), title: z.string().trim().max(120).nullish(), notes: z.string().trim().max(1000).nullish() })
      .parse(input);
    const id = await planEntry(db, data);
    done();
    return { id };
  });
}

export async function updateEntryAction(id: string, patch: { templateId?: string | null; title?: string; notes?: string | null }) {
  return run(async () => {
    const data = z.object({ templateId: z.uuid().nullish(), title: z.string().trim().max(120).optional(), notes: z.string().trim().max(1000).nullish() }).parse(patch);
    const real = await userErrors(() => updateEntry(db, entryId.parse(id), data));
    done();
    return { id: real };
  });
}

export async function moveEntryAction(id: string, date: string) {
  return run(async () => {
    const real = await userErrors(() => moveEntry(db, entryId.parse(id), ymd.parse(date)));
    done();
    return { id: real };
  });
}

/** skip = mark as not done ("ausgefallen"), planned = re-plan, cancelled = remove (undo possible). */
export async function setEntryStatusAction(id: string, status: "planned" | "skipped" | "cancelled") {
  return run(async () => {
    const res = await userErrors(() => setEntryStatus(db, entryId.parse(id), z.enum(["planned", "skipped", "cancelled"]).parse(status)));
    done();
    return res;
  });
}

export async function restoreEntryStatusAction(id: string, status: "planned" | "skipped" | "completed") {
  return run(async () => {
    await restoreEntryStatus(db, z.uuid().parse(id), z.enum(["planned", "skipped", "completed"]).parse(status));
    done();
  });
}

export async function createRuleAction(input: { kind: "workout" | "rest"; templateId?: string | null; title?: string | null; weekdays: number[]; startDate: string; endDate?: string | null }) {
  return run(async () => {
    const data = z
      .object({
        kind,
        templateId: z.uuid().nullish(),
        title: z.string().trim().max(120).nullish(),
        weekdays: z.array(z.number().int().min(1).max(7)).min(1, "Mindestens einen Wochentag wählen").max(7),
        startDate: ymd,
        endDate: ymd.nullish(),
      })
      .refine((d) => !d.endDate || d.endDate >= d.startDate, { message: "Ende liegt vor dem Start", path: ["endDate"] })
      .parse(input);
    const id = await createRule(db, data);
    done();
    return { id };
  });
}

export async function endRuleAction(id: string) {
  return run(async () => {
    const today = await getToday();
    await endRule(db, z.uuid().parse(id), today, addDays(today, -1));
    done();
  });
}
