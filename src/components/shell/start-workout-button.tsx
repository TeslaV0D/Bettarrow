"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { StartWorkoutDialog } from "./start-workout-dialog";

export function StartWorkoutButton({ label = "Training starten", ...props }: ButtonProps & { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" {...props} onClick={() => setOpen(true)}>
        <Play className="size-4 fill-current" aria-hidden />
        {label}
      </Button>
      <StartWorkoutDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
