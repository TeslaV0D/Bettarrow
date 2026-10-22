import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getCatalog, getRecentExerciseIds, getReferenceData } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { getLoggerState, loggerSettings } from "@/server/queries/logger";
import { WorkoutLogger } from "@/components/workout/workout-logger";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).history.editTitle };
}

export default async function EditWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [initial, catalog, reference, recentIds, settings] = await Promise.all([getLoggerState(id), getCatalog(), getReferenceData(), getRecentExerciseIds(), getSettings()]);
  if (!initial) notFound();
  if (initial.status === "active") redirect("/workout");
  return <WorkoutLogger key={initial.workoutId} initial={initial} catalog={catalog} reference={reference} recentIds={recentIds} settings={loggerSettings(settings)} />;
}
