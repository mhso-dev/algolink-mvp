import { Container } from "@/components/app/container";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-64" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </Container>
  );
}
