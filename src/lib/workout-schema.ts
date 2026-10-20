import { z } from "zod";
import { SET_TYPES } from "./training";

/** Validation of the workout snapshot the client syncs to the server. Shared by client and server. */

const isoDate = z.iso.datetime({ offset: true });

export const draftSetSchema = z.object({
  id: z.uuid(),
  setType: z.enum(SET_TYPES),
  weightKg: z.number().min(0).max(2000).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
  durationSeconds: z.number().int().min(0).max(86_400).nullable(),
  rir: z.number().min(0).max(10).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
  note: z.string().max(500).nullable(),
  completed: z.boolean(),
  completedAt: isoDate.nullable(),
});

export const draftExerciseSchema = z.object({
  id: z.uuid(),
  exerciseId: z.string().min(1).max(120),
  notes: z.string().max(2000).nullable(),
  restSeconds: z.number().int().min(0).max(3600).nullable(),
  sets: z.array(draftSetSchema).max(100),
});

export const syncPayloadSchema = z.object({
  /** Client timestamp (ms) of this snapshot; must increase monotonically per device. */
  revision: z.number().int().min(0),
  /** Server revision the client last saw (for conflict detection between devices). */
  baseRevision: z.number().int().min(0),
  deviceId: z.string().min(8).max(64),
  name: z.string().trim().min(1).max(120),
  notes: z.string().max(5000).nullable(),
  pausedAt: isoDate.nullable(),
  pausedSeconds: z.number().int().min(0).max(7 * 86_400),
  bodyweightKg: z.number().min(20).max(400).nullable(),
  exercises: z.array(draftExerciseSchema).max(60),
});

export type DraftSet = z.infer<typeof draftSetSchema>;
export type DraftExercise = z.infer<typeof draftExerciseSchema>;
export type SyncPayload = z.infer<typeof syncPayloadSchema>;

export type SyncResult =
  | { status: "ok"; revision: number }
  | { status: "stale"; revision: number }
  | { status: "conflict"; revision: number }
  | { status: "not_found" }
  | { status: "invalid"; message: string };
