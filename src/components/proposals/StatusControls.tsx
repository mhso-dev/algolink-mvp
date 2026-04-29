"use client";

// SPEC-PROPOSAL-001 §M4 REQ-PROPOSAL-DETAIL-003/004 — 상태 전환 버튼.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { transitionProposalStatusAction } from "@/app/(app)/(operator)/proposals/[id]/edit/actions";
import { ALLOWED_PROPOSAL_TRANSITIONS } from "@/lib/proposals/status-machine";
import { PROPOSAL_STATUS_LABELS } from "@/lib/proposals/labels";
import type { ProposalStatus } from "@/lib/proposals/types";

interface Props {
  proposalId: string;
  currentStatus: ProposalStatus;
  expectedUpdatedAt: string;
}

const TRANSITION_LABELS: Partial<Record<ProposalStatus, string>> = {
  submitted: "제출",
  lost: "실주",
  withdrawn: "취소",
  // won은 별도 ConvertToProjectButton에서 처리
};

export function StatusControls({
  proposalId,
  currentStatus,
  expectedUpdatedAt,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState<ProposalStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const allowed = ALLOWED_PROPOSAL_TRANSITIONS[currentStatus] ?? [];

  const onClick = async (to: ProposalStatus) => {
    if (!confirm(`${PROPOSAL_STATUS_LABELS[to]} 처리할까요?`)) return;
    setPending(to);
    setError(null);
    const result = await transitionProposalStatusAction({
      proposalId,
      toStatus: to,
      expectedUpdatedAt,
    });
    if (!result.ok) {
      setError(result.message);
      setPending(null);
      return;
    }
    router.refresh();
    setPending(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowed
        .filter((s): s is ProposalStatus => TRANSITION_LABELS[s] !== undefined)
        .map((to) => (
          <Button
            key={to}
            variant={to === "lost" ? "destructive" : "outline"}
            disabled={pending !== null}
            onClick={() => onClick(to)}
          >
            {pending === to ? "처리 중..." : TRANSITION_LABELS[to]}
          </Button>
        ))}
      {error && (
        <span className="text-sm text-destructive">{error}</span>
      )}
    </div>
  );
}
