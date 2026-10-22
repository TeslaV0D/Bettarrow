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
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).history.workout };
}

export default async function WorkoutPage() {
  const [t, activeId] = await Promise.all([getT(), getActiveWorkoutId(db)]);
  if (!activeId) {
    return (
      <Card className="mx-auto mt-10 max-w-md">
        <EmptyState
          icon={Dumbbell}
          title={t.history.noActive}
          description={t.history.noActiveText}
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
