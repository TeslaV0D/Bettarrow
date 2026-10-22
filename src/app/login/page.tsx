import type { Metadata } from "next";
import { getT } from "@/server/i18n";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth";
import { LoginForm } from "./login-form";
import { LogoMark } from "@/components/logo";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).login.title };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/");
  const { next } = await searchParams;
  const t = await getT();
  return (
    <main className="grid min-h-dvh place-items-center px-4 pb-10 pt-[calc(2.5rem+env(safe-area-inset-top))]">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-12" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Bettarrow</h1>
          <p className="mt-1 text-sm text-muted">{t.login.tagline}</p>
        </div>
        <LoginForm next={next ?? "/"} />
        <p className="mt-6 text-center text-xs text-subtle">{t.login.passwordHint}</p>
      </div>
    </main>
  );
}
