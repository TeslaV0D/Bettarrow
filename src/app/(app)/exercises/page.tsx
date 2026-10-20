import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCatalog, getReferenceData } from "@/server/queries/exercises";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { ExerciseBrowser } from "@/components/exercises/exercise-browser";

export const metadata: Metadata = { title: "Übungen" };

export default async function ExercisesPage() {
  const [catalog, reference] = await Promise.all([getCatalog(), getReferenceData()]);
  return (
    <>
      <PageHeader
        title="Übungen"
        subtitle={`${catalog.filter((e) => !e.archived).length} Übungen in deiner Datenbank`}
        actions={
          <Link href="/exercises/new" className={buttonClasses("primary", "md")}>
            <Plus className="size-4" aria-hidden />
            <span>Neue Übung</span>
          </Link>
        }
      />
      <ExerciseBrowser catalog={catalog} reference={reference} />
    </>
  );
}
