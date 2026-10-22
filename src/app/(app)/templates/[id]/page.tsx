import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { getTemplate } from "@/server/services/templates";
import { getCatalog, getRecentExerciseIds, getReferenceData } from "@/server/queries/exercises";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateEditor } from "@/components/templates/template-editor";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).templates.editTitle };
}

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [t, template, catalog, reference, recentIds] = await Promise.all([getT(), getTemplate(db, id), getCatalog(), getReferenceData(), getRecentExerciseIds()]);
  if (!template) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={template.name} subtitle={t.templates.editHint} back={{ href: "/templates", label: t.templates.title }} />
      <TemplateEditor
        templateId={template.id}
        catalog={catalog}
        reference={reference}
        recentIds={recentIds}
        initial={{
          name: template.name,
          description: template.description ?? "",
          notes: template.notes ?? "",
          items: template.items.map((i) => ({
            key: i.id,
            exerciseId: i.exerciseId,
            targetSets: i.targetSets,
            repMin: i.repMin?.toString() ?? "",
            repMax: i.repMax?.toString() ?? "",
            restSeconds: i.restSeconds?.toString() ?? "",
            notes: i.notes ?? "",
          })),
        }}
      />
    </div>
  );
}
