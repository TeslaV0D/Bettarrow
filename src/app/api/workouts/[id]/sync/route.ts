import { z } from "zod";
import { db } from "@/server/db";
import { guardMutation } from "@/server/request-guard";
import { syncWorkout } from "@/server/services/workouts";

export const dynamic = "force-dynamic";

const STATUS = { ok: 200, stale: 200, conflict: 409, not_found: 404, invalid: 400 } as const;

/** Autosave endpoint of the live workout editor (full snapshot, idempotent). */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await guardMutation(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ status: "not_found" }, { status: 404 });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 512_000) return Response.json({ status: "invalid", message: "Zu groß" }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ status: "invalid", message: "Ungültiges JSON" }, { status: 400 });
  }
  try {
    const result = await syncWorkout(db, id, body);
    return Response.json(result, { status: STATUS[result.status], headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[sync] failed:", err);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
