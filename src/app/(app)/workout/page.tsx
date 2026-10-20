import type { Metadata } from "next";
import { Dumbbell } from "lucide-react";
import { db } from "@/server/db";
import { getActiveWorkoutId } from "@/server/services/workouts";
import { getCatalog, getRecentExerciseIds, getReferenceData } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { getLoggerState, loggerSettings } from "@/server/queries/logger";
import { WorkoutLogger } from "@/components/workout/workout-logger";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StartWorkoutButton } from "@/components/shell/start-workout-button";

export const metadata: Metadata = { title: "Training" };

export default async function WorkoutPage() {
  const activeId = await getActiveWorkoutId(db);
  if (!activeId) {
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <EmptyState
          icon={Dumbbell}
          title="Kein laufendes Training"
          description="Starte ein Training aus einer Vorlage oder frei."
          action={<StartWorkoutButton />}
        />
      </Card>
    );
  }
  const [initial, catalog, reference, recentIds, settings] = await Promise.all([
    getLoggerState(activeId),
    getCatalog(),
    getReferenceData(),
    getRecentExerciseIds(),
    getSettings(),
  ]);
  if (!initial) return null;
  return <WorkoutLogger key={initial.workoutId} initial={initial} catalog={catalog} reference={reference} recentIds={recentIds} settings={loggerSettings(settings)} />;
}
