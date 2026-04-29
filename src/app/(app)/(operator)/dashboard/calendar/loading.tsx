import { Skeleton } from "@/components/ui/skeleton";
import { Container } from "@/components/app/container";

export default function CalendarLoading() {
  return (
    <Container variant="narrow" className="flex flex-col gap-4 py-6">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-[600px] w-full" />
    </Container>
  );
}
