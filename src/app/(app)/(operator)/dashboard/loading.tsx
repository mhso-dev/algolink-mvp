import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/app/container";

export default function DashboardLoading() {
  return (
    <Container variant="default" className="flex flex-col gap-6 py-6">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-5 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </Container>
  );
}
