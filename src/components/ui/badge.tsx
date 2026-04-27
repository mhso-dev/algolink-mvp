import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-1",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--color-primary-muted)] text-[var(--color-primary-muted-foreground)]",
        secondary: "border-transparent bg-[var(--color-neutral-100)] text-[var(--color-text)]",
        outline: "border-[var(--color-border-strong)] text-[var(--color-text)]",
        request: "border-transparent bg-[var(--color-state-request-muted)] text-[var(--color-state-request)]",
        proposed: "border-transparent bg-[var(--color-state-proposed-muted)] text-[var(--color-state-proposed)]",
        confirmed: "border-transparent bg-[var(--color-state-confirmed-muted)] text-[var(--color-state-confirmed)]",
        "in-progress": "border-transparent bg-[var(--color-state-in-progress-muted)] text-[var(--color-state-in-progress)]",
        completed: "border-transparent bg-[var(--color-state-completed-muted)] text-[var(--color-state-completed)]",
        settled: "border-transparent bg-[var(--color-state-settled-muted)] text-[var(--color-state-settled)]",
        pending: "border-transparent bg-[var(--color-state-pending-muted)] text-[var(--color-state-pending)]",
        alert: "border-transparent bg-[var(--color-state-alert-muted)] text-[var(--color-state-alert)]",
        info: "border-transparent bg-[var(--color-state-info-muted)] text-[var(--color-state-info)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
