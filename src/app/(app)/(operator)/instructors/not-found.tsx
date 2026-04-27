import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center flex flex-col gap-4">
      <h1 className="text-xl font-bold">존재하지 않는 강사입니다.</h1>
      <p className="text-sm text-[var(--color-text-muted)]">
        요청한 강사를 찾을 수 없거나 삭제된 강사입니다.
      </p>
      <Button asChild>
        <Link href="/instructors">강사 목록으로</Link>
      </Button>
    </div>
  );
}
