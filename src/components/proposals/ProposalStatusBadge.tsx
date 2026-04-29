// SPEC-PROPOSAL-001 §M3 — 제안서 상태 배지.
import { Badge } from "@/components/ui/badge";
import {
  PROPOSAL_STATUS_BADGE_VARIANT,
  PROPOSAL_STATUS_LABELS,
} from "@/lib/proposals/labels";
import type { ProposalStatus } from "@/lib/proposals/types";

interface Props {
  status: ProposalStatus;
}

export function ProposalStatusBadge({ status }: Props) {
  return (
    <Badge variant={PROPOSAL_STATUS_BADGE_VARIANT[status]}>
      {PROPOSAL_STATUS_LABELS[status]}
    </Badge>
  );
}
