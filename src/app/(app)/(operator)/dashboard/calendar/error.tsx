"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CalendarError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-12">
      <Card className="flex flex-col gap-3 p-6">
        <h1 className="text-xl font-bold">강사 일정을 불러오지 못했습니다.</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          일시적인 오류일 수 있습니다. 잠시 후 다시 시도해주세요.
        </p>
        <div>
          <Button type="button" onClick={() => reset()}>
            다시 시도
          </Button>
        </div>
      </Card>
    </div>
  );
}
