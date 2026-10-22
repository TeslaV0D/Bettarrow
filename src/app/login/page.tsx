import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { LoginForm } from "./login-form";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 pb-10 pt-[calc(2.5rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Bettarrow</h1>
          <p className="mt-1 text-sm text-muted">Dein persönliches Trainingstagebuch</p>
        </div>
        <LoginForm next={next ?? "/"} />
        <p className="mt-6 text-center text-xs text-subtle">Das Passwort wird in der Server-Konfiguration (.env) festgelegt.</p>
      </div>
    </main>
  );
}
