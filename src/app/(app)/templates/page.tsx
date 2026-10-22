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
import { fmt, plural } from "@/lib/i18n";
import { getT } from "@/server/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).templates.title };
}

export default async function TemplatesPage() {
  const [t, templates, catalog, reference] = await Promise.all([getT(), listTemplates(), getCatalog(), getReferenceData()]);
  const exById = new Map(catalog.map((e) => [e.id, e]));
  const muscleName = new Map(reference.muscles.map((m) => [m.id, m.name]));
  return (
    <>
      <PageHeader
        title={t.templates.title}
        subtitle={t.templates.subtitle}
        actions={
          <Link href="/templates/new" className={buttonClasses("primary", "md")}>
            <Plus className="size-4" aria-hidden />
            {t.templates.new}
          </Link>
        }
      />
      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={t.templates.empty}
            description={t.templates.emptyText}
            action={
              <Link href="/templates/new" className={buttonClasses("primary", "md")}>
                <Plus className="size-4" aria-hidden />
                {t.templates.createFirst}
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => {
            const muscles = [...new Set(tpl.exerciseIds.map((id) => exById.get(id)?.primaryMuscleId).filter(Boolean) as string[])];
            return (
              <Card key={tpl.id} className="flex flex-col p-4">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[17px] font-semibold tracking-tight">{tpl.name}</h2>
                  {tpl.description ? <p className="mt-0.5 line-clamp-2 text-sm text-muted">{tpl.description}</p> : null}
                  <p className="mt-2 text-sm text-muted">
                    {plural(t.units.exercises, tpl.exerciseIds.length)} · {plural(t.units.sets, tpl.totalSets)}
                    {tpl.lastUsed ? ` · ${fmt(t.start.lastUsed, { date: formatDay(tpl.lastUsed, "dayMonth") })}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {muscles.slice(0, 5).map((m) => (
                      <Badge key={m}>{muscleName.get(m)}</Badge>
                    ))}
                    {muscles.length > 5 ? <Badge tone="outline">+{muscles.length - 5}</Badge> : null}
                  </div>
                  <ol className="mt-3 space-y-0.5 text-sm text-muted">
                    {tpl.exerciseIds.slice(0, 4).map((id, i) => (
                      <li key={`${id}-${i}`} className="truncate">
                        {exById.get(id)?.name ?? id}
                      </li>
                    ))}
                    {tpl.exerciseIds.length > 4 ? <li className="text-subtle">{fmt(t.templates.more, { n: tpl.exerciseIds.length - 4 })}</li> : null}
                  </ol>
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <TemplateCardActions id={tpl.id} name={tpl.name} />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
