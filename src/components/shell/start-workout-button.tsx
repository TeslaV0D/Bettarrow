"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { StartWorkoutDialog } from "./start-workout-dialog";

export function StartWorkoutButton({ label, ...props }: ButtonProps & { label?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" {...props} onClick={() => setOpen(true)}>
        <Play className="size-4 fill-current" aria-hidden />
        {label ?? t.shell.startWorkout}
      </Button>
      <StartWorkoutDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
