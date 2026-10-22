import type { Metadata } from "next";
import { getCatalog, getRecentExerciseIds, getReferenceData } from "@/server/queries/exercises";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateEditor } from "@/components/templates/template-editor";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).templates.new };
}

export default async function NewTemplatePage() {
  const [t, catalog, reference, recentIds] = await Promise.all([getT(), getCatalog(), getReferenceData(), getRecentExerciseIds()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.templates.new} back={{ href: "/templates", label: t.templates.title }} />
      <TemplateEditor templateId={null} initial={{ name: "", description: "", notes: "", items: [] }} catalog={catalog} reference={reference} recentIds={recentIds} />
    </div>
  );
}
