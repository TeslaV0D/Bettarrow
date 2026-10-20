import type { Metadata } from "next";
import { getCatalog, getRecentExerciseIds, getReferenceData } from "@/server/queries/exercises";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateEditor } from "@/components/templates/template-editor";

export const metadata: Metadata = { title: "Neue Vorlage" };

export default async function NewTemplatePage() {
  const [catalog, reference, recentIds] = await Promise.all([getCatalog(), getReferenceData(), getRecentExerciseIds()]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Neue Vorlage" back={{ href: "/templates", label: "Vorlagen" }} />
      <TemplateEditor templateId={null} initial={{ name: "", description: "", notes: "", items: [] }} catalog={catalog} reference={reference} recentIds={recentIds} />
    </div>
  );
}
