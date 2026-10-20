import type { Metadata } from "next";
import { getReferenceData } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { PageHeader } from "@/components/ui/page-header";
import { ExerciseForm } from "@/components/exercises/exercise-form";
import type { LoadMode } from "@/lib/training";

export const metadata: Metadata = { title: "Neue Übung" };

export default async function NewExercisePage() {
  const [reference, settings] = await Promise.all([getReferenceData(), getSettings()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Neue Übung" back={{ href: "/exercises", label: "Übungen" }} />
      <ExerciseForm reference={reference} defaultBodyweightMode={settings.defaultBodyweightMode as LoadMode} />
    </div>
  );
}
