import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getCatalog, getRecentExerciseIds, getReferenceData } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { getLoggerState, loggerSettings } from "@/server/queries/logger";
import { WorkoutLogger } from "@/components/workout/workout-logger";

export const metadata: Metadata = { title: "Training bearbeiten" };

export default async function EditWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [initial, catalog, reference, recentIds, settings] = await Promise.all([getLoggerState(id), getCatalog(), getReferenceData(), getRecentExerciseIds(), getSettings()]);
  if (!initial) notFound();
  if (initial.status === "active") redirect("/workout");
  return <WorkoutLogger key={initial.workoutId} initial={initial} catalog={catalog} reference={reference} recentIds={recentIds} settings={loggerSettings(settings)} />;
}
