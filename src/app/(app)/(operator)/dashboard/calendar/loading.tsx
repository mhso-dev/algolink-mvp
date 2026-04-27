import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-6">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-[600px] w-full" />
    </div>
  );
}
