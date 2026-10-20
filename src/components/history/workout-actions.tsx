"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Ellipsis, Pencil, Repeat, Trash2 } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { deleteWorkoutAction } from "@/server/actions/workouts";
import { useStartWorkout } from "@/components/shell/use-start-workout";

export function WorkoutActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const { start, pending } = useStartWorkout();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" loading={pending !== null} onClick={() => start({ repeatWorkoutId: id })}>
        {pending === null ? <Repeat className="size-4" aria-hidden /> : null}
        Erneut durchführen
      </Button>
      <Link href={`/history/${id}/edit`} className={buttonClasses("secondary", "icon")} aria-label="Bearbeiten" title="Bearbeiten">
        <Pencil className="size-4" />
      </Link>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Weitere Aktionen">
            <Ellipsis className="size-4" />
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem icon={Trash2} destructive onSelect={() => setConfirm(true)}>
            Training löschen
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title={`„${name}“ endgültig löschen?`}
        description="Alle Sätze dieses Trainings werden dauerhaft gelöscht. Statistiken, Bestleistungen und Vorwerte werden neu berechnet. Das kann nicht rückgängig gemacht werden (außer über ein Backup)."
        confirmLabel="Endgültig löschen"
        onConfirm={async () => {
          const res = await deleteWorkoutAction(id);
          if (!res.ok) return void toast.error(res.error);
          toast.success("Training gelöscht");
          router.replace("/history");
          router.refresh();
        }}
      />
    </div>
  );
}
