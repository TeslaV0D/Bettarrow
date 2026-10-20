import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { listTemplates } from "@/server/queries/templates";
import { getCatalog, getReferenceData } from "@/server/queries/exercises";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { TemplateCardActions } from "@/components/templates/template-card-actions";
import { formatDay } from "@/lib/format";

export const metadata: Metadata = { title: "Vorlagen" };

export default async function TemplatesPage() {
  const [templates, catalog, reference] = await Promise.all([listTemplates(), getCatalog(), getReferenceData()]);
  const exById = new Map(catalog.map((e) => [e.id, e]));
  const muscleName = new Map(reference.muscles.map((m) => [m.id, m.name]));
  return (
    <>
      <PageHeader
        title="Vorlagen"
        subtitle="Wiederverwendbare Trainingspläne"
        actions={
          <Link href="/templates/new" className={buttonClasses("primary", "md")}>
            <Plus className="size-4" aria-hidden />
            Neue Vorlage
          </Link>
        }
      />
      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="Noch keine Vorlagen"
            description="Lege Vorlagen wie Push, Pull oder Ganzkörper an, um Trainings mit einem Tipp zu starten."
            action={
              <Link href="/templates/new" className={buttonClasses("primary", "md")}>
                <Plus className="size-4" aria-hidden />
                Erste Vorlage erstellen
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const muscles = [...new Set(t.exerciseIds.map((id) => exById.get(id)?.primaryMuscleId).filter(Boolean) as string[])];
            return (
              <Card key={t.id} className="flex flex-col p-4">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[17px] font-semibold tracking-tight">{t.name}</h2>
                  {t.description ? <p className="mt-0.5 line-clamp-2 text-sm text-muted">{t.description}</p> : null}
                  <p className="mt-2 text-sm text-muted">
                    {t.exerciseIds.length} {t.exerciseIds.length === 1 ? "Übung" : "Übungen"} · {t.totalSets} Sätze
                    {t.lastUsed ? ` · zuletzt ${formatDay(t.lastUsed, "dayMonth")}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {muscles.slice(0, 5).map((m) => (
                      <Badge key={m}>{muscleName.get(m)}</Badge>
                    ))}
                    {muscles.length > 5 ? <Badge tone="outline">+{muscles.length - 5}</Badge> : null}
                  </div>
                  <ol className="mt-3 space-y-0.5 text-sm text-muted">
                    {t.exerciseIds.slice(0, 4).map((id, i) => (
                      <li key={`${id}-${i}`} className="truncate">
                        {exById.get(id)?.name ?? id}
                      </li>
                    ))}
                    {t.exerciseIds.length > 4 ? <li className="text-subtle">+ {t.exerciseIds.length - 4} weitere</li> : null}
                  </ol>
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <TemplateCardActions id={t.id} name={t.name} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
