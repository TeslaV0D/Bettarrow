"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction, type LoginState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useT } from "@/components/i18n-provider";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const t = useT();
  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-surface p-5">
      <input type="hidden" name="next" value={next} />
      <Field label={t.login.password} htmlFor="password" error={state.error}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={state.error ? true : undefined}
        />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
        {!pending ? <LogIn className="size-4" aria-hidden /> : null}
        {t.login.submit}
      </Button>
    </form>
  );
}
