"use client";

// SPEC-RECEIPT-001 §M5/M6 — 운영자 수취 확인 + 영수증 발급 패널.
// REQ-RECEIPT-OPERATOR-001/002.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatKRW } from "@/lib/utils";
import { confirmRemittanceAndIssueReceipt } from "@/app/(app)/(operator)/settlements/[id]/confirm-remittance/actions";

interface Props {
  settlementId: string;
  expectedAmountKrw: number;
  registeredRemittance?: {
    date: string | null;
    amountKrw: number | null;
  };
}

function todayKst(): string {
  // YYYY-MM-DD KST.
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function RemittanceConfirmationPanel({
  settlementId,
  expectedAmountKrw,
  registeredRemittance,
}: Props) {
  const [receivedDate, setReceivedDate] = useState(todayKst());
  const [receivedAmount, setReceivedAmount] = useState(
    String(expectedAmountKrw),
  );
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    setSuccess(null);
    const amount = Number(receivedAmount);
    if (!Number.isFinite(amount) || amount !== expectedAmountKrw) {
      setError("실제 입금 금액이 예상 금액과 일치해야 합니다.");
      return;
    }

    const confirmed = window.confirm(
      "영수증을 발급하시겠습니까? 발급 후 변경할 수 없습니다.",
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await confirmRemittanceAndIssueReceipt({
        settlementId,
        receivedDate,
        receivedAmountKrw: amount,
        memo: memo.trim() || null,
      });
      if (!result.ok) {
        setError(result.message ?? "영수증 발급에 실패했습니다.");
        return;
      }
      setSuccess(`영수증이 발급되었습니다 (${result.receiptNumber}).`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {registeredRemittance ? (
        <div className="rounded-md bg-[var(--color-bg-muted)] p-3 text-sm">
          <p className="font-medium">강사 송금 등록 정보</p>
          <p className="text-[var(--color-text-muted)] mt-1">
            등록일: {registeredRemittance.date ?? "—"} · 금액:{" "}
            {registeredRemittance.amountKrw !== null
              ? `${formatKRW(registeredRemittance.amountKrw)} 원`
              : "—"}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3">
        <div>
          <Label htmlFor="receivedDate">입금 확인 일자</Label>
          <Input
            id="receivedDate"
            type="date"
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="receivedAmountKrw">
            실제 입금 금액 (예상: {formatKRW(expectedAmountKrw)} 원)
          </Label>
          <Input
            id="receivedAmountKrw"
            type="number"
            value={receivedAmount}
            onChange={(e) => setReceivedAmount(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="memo">메모 (선택)</Label>
          <Textarea
            id="memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="text-sm text-[var(--color-danger)] font-medium"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm text-[var(--color-success)] font-medium">
          {success}
        </p>
      ) : null}

      <Button onClick={handleSubmit} disabled={pending}>
        {pending ? "처리 중..." : "수취 확인 + 영수증 발급"}
      </Button>
    </div>
  );
}
