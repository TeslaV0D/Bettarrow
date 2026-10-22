"use client";

import { useOptimistic, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { toggleFavoriteAction } from "@/server/actions/exercises";
import { useT } from "@/components/i18n-provider";

export function FavoriteButton({ id, favorite, className }: { id: string; favorite: boolean; className?: string }) {
  const [optimistic, setOptimistic] = useOptimistic(favorite);
  const [, startTransition] = useTransition();
  const t = useT();
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? t.exercises.unfavorite : t.exercises.favorite}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          setOptimistic(!optimistic);
          const res = await toggleFavoriteAction(id, !optimistic);
          if (!res.ok) toast.error(res.error);
        });
      }}
      className={cn("grid size-10 place-items-center rounded-md transition-colors hover:bg-surface-2", className)}
    >
      <Star className={cn("size-[18px]", optimistic ? "fill-warning text-warning" : "text-subtle")} aria-hidden />
    </button>
  );
}
