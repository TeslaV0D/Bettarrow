import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCatalog, getReferenceData } from "@/server/queries/exercises";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { ExerciseBrowser } from "@/components/exercises/exercise-browser";
import { plural } from "@/lib/i18n";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).exercises.title };
}

export default async function ExercisesPage() {
  const [t, catalog, reference] = await Promise.all([getT(), getCatalog(), getReferenceData()]);
  return (
    <>
      <PageHeader
        title={t.exercises.title}
        subtitle={plural(t.exercises.inDatabase, catalog.filter((e) => !e.archived).length)}
        actions={
          <Link href="/exercises/new" className={buttonClasses("primary", "md")}>
            <Plus className="size-4" aria-hidden />
            <span>{t.exercises.new}</span>
          </Link>
        }
      />
      <ExerciseBrowser catalog={catalog} reference={reference} />
    </>
  );
}
