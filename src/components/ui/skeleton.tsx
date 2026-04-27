import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--color-neutral-200)] dark:bg-[var(--color-neutral-800)]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
