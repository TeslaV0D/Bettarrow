import { cn } from "@/lib/cn";

/** Brand mark: an upward arrow formed by two strokes. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M9.5 19.5 16 9.5l6.5 10" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 10.5v12.5" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      <span className="text-[17px] font-semibold tracking-tight">Bettarrow</span>
    </span>
  );
}
