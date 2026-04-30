"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteProposalAction } from "@/app/(app)/(operator)/proposals/[id]/edit/actions";

export function DeleteProposalButton({
  proposalId,
  title,
}: {
  proposalId: string;
  title: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`"${title}" 제안서를 삭제하시겠습니까?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteProposalAction(proposalId);
      if (!result.ok) {
        setError(result.error ?? "제안서 삭제에 실패했습니다.");
        return;
      }
      router.push("/proposals");
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
