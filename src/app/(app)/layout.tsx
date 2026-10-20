import { eq } from "drizzle-orm";
import { requirePageAuth } from "@/server/auth";
import { db } from "@/server/db";
import { workouts } from "@/server/db/schema";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requirePageAuth();
  const [active] = await db
    .select({
      id: workouts.id,
      name: workouts.name,
      startedAt: workouts.startedAt,
      pausedAt: workouts.pausedAt,
      pausedSeconds: workouts.pausedSeconds,
    })
    .from(workouts)
    .where(eq(workouts.status, "active"))
    .limit(1);
  return (
    <AppShell
      active={
        active
          ? {
              id: active.id,
              name: active.name,
              startedAt: active.startedAt.toISOString(),
              pausedAt: active.pausedAt?.toISOString() ?? null,
              pausedSeconds: active.pausedSeconds,
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
