"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { softDeleteInstructorAction } from "../[id]/edit/actions";

export function DeleteInstructorButton({
  instructorId,
  instructorName,
}: {
  instructorId: string;
  instructorName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`${instructorName} 강사를 삭제하시겠습니까?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await softDeleteInstructorAction(instructorId);
      if (!result.ok) {
        setError(result.error ?? "강사 삭제에 실패했습니다.");
        return;
      }
      router.push("/instructors");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" onClick={handleDelete} disabled={pending}>
        <Trash2 className="h-4 w-4" />
        {pending ? "삭제 중..." : "삭제"}
      </Button>
      {error ? (
        <p className="text-xs text-[var(--color-state-alert)]">{error}</p>
      ) : null}
    </div>
  );
}
