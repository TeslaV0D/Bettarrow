"use server";

import { redirect } from "next/navigation";
import {
  clearFailures,
  clientKey,
  createSession,
  destroySession,
  isRateLimited,
  recordFailure,
  verifyPassword,
} from "@/server/auth";
import { getT } from "@/server/i18n";

export interface LoginState {
  error?: string;
}

function safeNext(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const key = await clientKey();
  if (isRateLimited(key) || isRateLimited("*", 30)) {
    return { error: (await getT()).login.rateLimited };
  }
  const password = String(formData.get("password") ?? "");
  const ok = await verifyPassword(password);
  if (!ok) {
    recordFailure(key);
    recordFailure("*");
    // Small constant delay to slow down guessing.
    await new Promise((r) => setTimeout(r, 400));
    return { error: (await getT()).login.wrongPassword };
  }
  clearFailures(key);
  await createSession();
  redirect(safeNext(formData.get("next")));
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
