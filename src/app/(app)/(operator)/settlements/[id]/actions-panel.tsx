"use client";

// SPEC-PAYOUT-001 §M5 — 상태 전환 컨트롤 패널 (Client Component).
// paid 동결: 모든 버튼 disabled. confirm 다이얼로그는 window.confirm 으로 단순화 (M5 후속에서 Dialog 컴포넌트로 교체 가능).

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestSettlement } from "./request/actions";
import { markPaid } from "./mark-paid/actions";
import { holdSettlement, resumeSettlement } from "./hold/actions";
import {
  PAYOUT_ERRORS,
  type SettlementStatus,
  validateTransition,
} from "@/lib/payouts";

export interface SettlementActionsPanelProps {
  settlementId: string;
  status: SettlementStatus;
  instructorName: string;
}

export function SettlementActionsPanel({
  settlementId,
  status,
  instructorName,
}: SettlementActionsPanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isPaid = status === "paid";

  const canRequest = validateTransition(status, "requested").ok;
  const canMarkPaid = validateTransition(status, "paid").ok;
  const canHold = validateTransition(status, "held").ok;

  const handle = (
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) => {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setError(r.error ?? PAYOUT_ERRORS.GENERIC_FAILED);
    });
  };

  const onRequest = () => {
    if (!confirm(`강사 ${instructorName}에게 정산 요청 알림을 발송합니다. 계속하시겠습니까?`)) {
      return;
    }
    handle(() => requestSettlement(settlementId));
  };

  const onMarkPaid = () => {
    if (!confirm("입금이 확인되었습니까? 정산 완료 후에는 변경할 수 없습니다.")) {
      return;
    }
    handle(() => markPaid(settlementId));
  };

  const onHold = () => {
    const notes = prompt("보류 사유를 입력하세요 (선택).") ?? undefined;
    handle(() => holdSettlement({ settlementId, notes }));
  };

  const onResume = () => {
    handle(() => resumeSettlement(settlementId));
  };

  return (
    <div className="flex flex-col gap-3" aria-label="상태 전환 컨트롤">
      {isPaid && (
        <div
          role="status"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-2 text-sm text-[var(--color-text-muted)]"
        >
          정산 완료된 항목입니다. 변경할 수 없습니다.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {status === "pending" && (
          <Button
            type="button"
            disabled={pending || !canRequest || isPaid}
            aria-disabled={pending || !canRequest || isPaid}
            onClick={onRequest}
          >
            정산 요청
          </Button>
        )}
        {status === "requested" && (
          <Button
            type="button"
            disabled={pending || !canMarkPaid || isPaid}
            aria-disabled={pending || !canMarkPaid || isPaid}
            onClick={onMarkPaid}
          >
            입금 확인
          </Button>
        )}
        {status === "held" && (
          <Button
            type="button"
            disabled={pending || isPaid}
            aria-disabled={pending || isPaid}
            onClick={onResume}
          >
            재요청
          </Button>
        )}
        {(status === "pending" || status === "requested") && (
          <Button
            type="button"
            variant="outline"
            disabled={pending || !canHold || isPaid}
            aria-disabled={pending || !canHold || isPaid}
            onClick={onHold}
          >
            보류
          </Button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="text-sm text-[var(--color-destructive)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
