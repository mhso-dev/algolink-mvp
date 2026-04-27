"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { regenerateSummary } from "@/app/(app)/(operator)/instructors/[id]/actions";

export function RegenerateButton({ instructorId }: { instructorId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const r = await regenerateSummary(instructorId);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        <RotateCcw className="h-3.5 w-3.5" /> {isPending ? "재생성 중..." : "재생성"}
      </Button>
      {error ? (
        <p role="alert" className="text-[10px] text-[var(--color-state-alert)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
