"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { startWorkoutAction } from "@/server/actions/workouts";

export type StartInput = Parameters<typeof startWorkoutAction>[0];

/** Starts (or resumes) a workout and navigates to the live view. */
export function useStartWorkout() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  async function start(input: StartInput, key = "default") {
    setPending(key);
    try {
      const res = await startWorkoutAction(input);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      if (res.data.existing) toast("Es läuft bereits ein Training – es wird fortgesetzt.");
      router.push("/workout");
      return true;
    } finally {
      setPending(null);
    }
  }
  return { start, pending };
}
