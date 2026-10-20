import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExercise, getReferenceData } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { PageHeader } from "@/components/ui/page-header";
import { ExerciseForm } from "@/components/exercises/exercise-form";
import type { LoadMode } from "@/lib/training";

export const metadata: Metadata = { title: "Übung bearbeiten" };

export default async function EditExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [exercise, reference, settings] = await Promise.all([getExercise(decodeURIComponent(id)), getReferenceData(), getSettings()]);
  if (!exercise) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Übung bearbeiten"
        subtitle={!exercise.isCustom ? "Standardübung – deine Änderungen bleiben bei App-Updates erhalten." : undefined}
        back={{ href: `/exercises/${exercise.id}`, label: exercise.name }}
      />
      <ExerciseForm
        reference={reference}
        exerciseId={exercise.id}
        defaultBodyweightMode={settings.defaultBodyweightMode as LoadMode}
        initial={{
          name: exercise.name,
          aliases: exercise.aliases,
          description: exercise.description ?? "",
          instructions: exercise.instructions ?? "",
          primaryMuscleId: exercise.primaryMuscleId,
          secondaryMuscleIds: exercise.secondaryMuscleIds,
          equipmentId: exercise.equipmentId,
          movementPatternId: exercise.movementPatternId ?? "",
          mechanic: exercise.mechanic as "compound" | "isolation",
          tracking: exercise.tracking as "reps" | "duration",
          loadMode: exercise.loadMode as LoadMode,
          bodyweightFactor: String(exercise.bodyweightFactor),
          repMin: exercise.repMin?.toString() ?? "",
          repMax: exercise.repMax?.toString() ?? "",
          restSeconds: exercise.restSeconds?.toString() ?? "",
          notes: exercise.notes ?? "",
        }}
      />
    </div>
  );
}
