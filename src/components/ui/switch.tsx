"use client";

import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onCheckedChange,
  id,
  name,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-accent/40 bg-accent" : "border-border-strong bg-surface-3",
          disabled && "opacity-50",
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full shadow transition-transform",
            checked ? "translate-x-6 bg-accent-ink" : "translate-x-1 bg-muted",
          )}
        />
      </button>
      {name ? <input type="hidden" name={name} value={checked ? "true" : "false"} /> : null}
    </>
  );
}
