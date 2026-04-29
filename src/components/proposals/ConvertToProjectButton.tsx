"use client";

// SPEC-PROPOSAL-001 §M6 REQ-PROPOSAL-CONVERT-* — Won → Project 변환 트리거.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { convertProposalToProjectAction } from "@/app/(app)/(operator)/proposals/[id]/convert/actions";

interface Props {
  proposalId: string;
}

export function ConvertToProjectButton({ proposalId }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onClick = async () => {
    if (!confirm("이 제안서를 수주하고 프로젝트로 변환할까요?")) return;
    setPending(true);
    setError(null);
    const result = await convertProposalToProjectAction({ proposalId });
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(`/projects/${result.projectId}`);
  };

  return (
    <div>
      <Button onClick={onClick} disabled={pending} variant="default">
        {pending ? "변환 중..." : "수주 + 프로젝트 생성"}
      </Button>
      {error && (
        <p className="text-sm text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}
