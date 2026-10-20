"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Ellipsis, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Textarea } from "@/components/ui/input";
import { deleteExerciseAction, resetBuiltinExerciseAction, setArchivedAction, setExerciseNotesAction } from "@/server/actions/exercises";
import { FavoriteButton } from "./favorite-button";

export function ExerciseActions({ id, favorite, archived, isCustom, isModified }: { id: string; favorite: boolean; archived: boolean; isCustom: boolean; isModified: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <FavoriteButton id={id} favorite={favorite} className="border border-border" />
      <Link href={`/exercises/${encodeURIComponent(id)}/edit`} className={buttonClasses("secondary", "md")}>
        <Pencil className="size-4" /> Bearbeiten
      </Link>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="Weitere Aktionen">
            <Ellipsis className="size-4" />
          </Button>
        </DropdownTrigger>
        <DropdownContent>
          {!isCustom && isModified ? (
            <DropdownItem
              icon={RotateCcw}
              onSelect={async () => {
                const res = await resetBuiltinExerciseAction(id);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Standardwerte wiederhergestellt");
                router.refresh();
              }}
            >
              Auf Standard zurücksetzen
            </DropdownItem>
          ) : null}
          <DropdownItem
            icon={archived ? ArchiveRestore : Archive}
            onSelect={async () => {
              const res = await setArchivedAction(id, !archived);
              if (!res.ok) return void toast.error(res.error);
              toast.success(archived ? "Übung wiederhergestellt" : "Übung archiviert – sie bleibt im Verlauf erhalten");
              router.refresh();
            }}
          >
            {archived ? "Aus Archiv holen" : "Archivieren"}
          </DropdownItem>
          {isCustom ? (
            <>
              <DropdownSeparator />
              <DropdownItem icon={Trash2} destructive onSelect={() => setConfirm(true)}>
                Löschen
              </DropdownItem>
            </>
          ) : null}
        </DropdownContent>
      </Dropdown>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive
        title="Übung löschen?"
        description="Wurde die Übung bereits verwendet (Training oder Vorlage), wird sie stattdessen archiviert – deine Trainingsdaten bleiben immer erhalten."
        confirmLabel="Löschen"
        onConfirm={async () => {
          const res = await deleteExerciseAction(id);
          if (!res.ok) return void toast.error(res.error);
          if (res.data.archived) {
            toast("Übung wird verwendet und wurde archiviert.");
            router.refresh();
          } else {
            toast.success("Übung gelöscht");
            router.replace("/exercises");
            router.refresh();
          }
        }}
      />
    </div>
  );
}

export function ExerciseNotes({ id, notes }: { id: string; notes: string | null }) {
  const [value, setValue] = useState(notes ?? "");
  const [saved, setSaved] = useState(notes ?? "");
  const dirty = value.trim() !== saved.trim();
  return (
    <div>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} placeholder="Eigene Notizen, z. B. Sitzeinstellung, Griff, Technik-Cues …" aria-label="Eigene Notizen" maxLength={5000} />
      {dirty ? (
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              const res = await setExerciseNotesAction(id, value);
              if (!res.ok) return void toast.error(res.error);
              setSaved(value);
              toast.success("Notiz gespeichert");
            }}
          >
            Notiz speichern
          </Button>
        </div>
      ) : null}
    </div>
  );
}
