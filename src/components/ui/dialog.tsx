"use client";

import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = RD.Root;
export const DialogTrigger = RD.Trigger;
export const DialogClose = RD.Close;

/**
 * Responsive dialog: bottom sheet on small screens, centered panel from `sm` upwards.
 */
export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  size = "md",
  hideTitle,
  onOpenAutoFocus,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  hideTitle?: boolean;
  onOpenAutoFocus?: (e: Event) => void;
}) {
  const width = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-lg", xl: "sm:max-w-2xl" }[size];
  return (
    <RD.Portal>
      <RD.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <RD.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          "fixed z-50 flex max-h-[92dvh] w-full flex-col border border-border bg-surface shadow-2xl focus:outline-none",
          "inset-x-0 bottom-0 rounded-t-xl data-[state=open]:animate-slide-up",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:data-[state=open]:animate-scale-in",
          width,
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden />
        <div className={cn("flex items-start justify-between gap-3 px-5 pt-4 sm:pt-5", hideTitle && "sr-only")}>
          <div className="min-w-0">
            <RD.Title className="text-base font-semibold tracking-tight">{title}</RD.Title>
            {description ? <RD.Description className="mt-1 text-sm text-muted">{description}</RD.Description> : null}
          </div>
          <RD.Close className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface-2 hover:text-text" aria-label="Schließen">
            <X className="size-4" />
          </RD.Close>
        </div>
        {!description ? <RD.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</RD.Description> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </RD.Content>
    </RD.Portal>
  );
}
