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
import { fmt } from "@/lib/i18n";
import { useT } from "@/components/i18n-provider";

export function WorkoutActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const t = useT();
  const { start, pending } = useStartWorkout();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" loading={pending !== null} onClick={() => start({ repeatWorkoutId: id })}>
        {pending === null ? <Repeat className="size-4" aria-hidden /> : null}
        {t.history.repeat}
      </Button>
      <Link href={`/history/${id}/edit`} className={buttonClasses("secondary", "icon")} aria-label={t.common.edit} title={t.common.edit}>
        <Pencil className="size-4" />
      </Link>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={t.exercises.moreActions}>
            <Ellipsis className="size-4" />
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem icon={Trash2} destructive onSelect={() => setConfirm(true)}>
            {t.history.delete}
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title={fmt(t.history.deleteTitle, { name })}
        description={t.history.deleteText}
        confirmLabel={t.history.deleteConfirm}
        onConfirm={async () => {
          const res = await deleteWorkoutAction(id);
          if (!res.ok) return void toast.error(res.error);
          toast.success(t.history.deleted);
          router.replace("/history");
          router.refresh();
        }}
      />
    </div>
  );
}
