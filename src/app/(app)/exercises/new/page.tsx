import type { Metadata } from "next";
import { getReferenceData } from "@/server/queries/exercises";
import { getSettings } from "@/server/queries/settings";
import { PageHeader } from "@/components/ui/page-header";
import { ExerciseForm } from "@/components/exercises/exercise-form";
import type { LoadMode } from "@/lib/training";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).exercises.new };
}

export default async function NewExercisePage() {
  const [t, reference, settings] = await Promise.all([getT(), getReferenceData(), getSettings()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.exercises.new} back={{ href: "/exercises", label: t.exercises.title }} />
      <ExerciseForm reference={reference} defaultBodyweightMode={settings.defaultBodyweightMode as LoadMode} />
    </div>
  );
}
