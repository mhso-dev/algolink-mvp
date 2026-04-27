"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="system"
      position="bottom-right"
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "bg-[var(--color-surface)] text-[var(--color-text)] border border-[var(--color-border)] shadow-md text-sm",
          description: "text-[var(--color-text-muted)] text-xs",
          actionButton:
            "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs px-2.5 py-1 rounded-sm",
          cancelButton: "bg-transparent text-[var(--color-text-muted)] text-xs",
          success: "border-l-4 border-l-[var(--color-state-settled)]",
          error: "border-l-4 border-l-[var(--color-state-alert)]",
          warning: "border-l-4 border-l-[var(--color-state-pending)]",
          info: "border-l-4 border-l-[var(--color-state-info)]",
        },
      }}
      {...props}
    />
  );
}
