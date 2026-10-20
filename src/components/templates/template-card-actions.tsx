"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Ellipsis, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { deleteTemplateAction, duplicateTemplateAction } from "@/server/actions/templates";
import { useStartWorkout } from "@/components/shell/use-start-workout";

export function TemplateCardActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { start, pending } = useStartWorkout();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" size="sm" loading={pending !== null} onClick={() => start({ templateId: id })}>
        {pending === null ? <Play className="size-3.5 fill-current" aria-hidden /> : null}
        Starten
      </Button>
      <Link href={`/templates/${id}`} className="inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text">
        <Pencil className="size-3.5" aria-hidden />
        Bearbeiten
      </Link>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Weitere Aktionen für ${name}`} className="ml-auto">
            <Ellipsis className="size-4" />
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem
            icon={Copy}
            onSelect={async () => {
              const res = await duplicateTemplateAction(id);
              if (res.ok) {
                toast.success("Vorlage dupliziert");
                router.refresh();
              } else toast.error(res.error);
            }}
          >
            Duplizieren
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem icon={Trash2} destructive onSelect={() => setConfirm(true)}>
            Löschen
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title={`„${name}“ löschen?`}
        description="Die Vorlage wird gelöscht. Bereits absolvierte Trainings und ihre Ergebnisse bleiben vollständig erhalten."
        confirmLabel="Löschen"
        onConfirm={async () => {
          const res = await deleteTemplateAction(id);
          if (res.ok) {
            toast.success("Vorlage gelöscht");
            router.refresh();
          } else toast.error(res.error);
        }}
      />
    </div>
  );
}
