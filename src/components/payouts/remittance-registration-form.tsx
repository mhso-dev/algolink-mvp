"use client";

// SPEC-RECEIPT-001 §M4/M6 — 강사 송금 등록 폼.
// REQ-RECEIPT-INSTRUCTOR-002/003.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKRW } from "@/lib/utils";
import { registerInstructorRemittance } from "@/app/(app)/(instructor)/me/settlements/[id]/remit/actions";

interface Props {
  settlementId: string;
  expectedAmountKrw: number;
}

function todayKst(): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function RemittanceRegistrationForm({
  settlementId,
  expectedAmountKrw,
}: Props) {
  const [date, setDate] = useState(todayKst());
  const [amount, setAmount] = useState(String(expectedAmountKrw));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum !== expectedAmountKrw) {
      setError("송금 금액이 정산 정보와 일치하지 않습니다.");
      return;
    }

    const formData = new FormData(e.currentTarget);
    formData.set("settlementId", settlementId);
    formData.set("remittanceDate", date);
    formData.set("remittanceAmountKrw", String(amountNum));

    startTransition(async () => {
      const result = await registerInstructorRemittance(formData);
      if (!result.ok) {
        setError(result.message ?? "송금 등록에 실패했습니다.");
        return;
      }
      setSuccess("송금 등록이 완료되었습니다. 알고링크 입금 확인을 기다려 주세요.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="remittanceDate">송금 일자</Label>
        <Input
          id="remittanceDate"
          name="remittanceDate"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={todayKst()}
          required
        />
      </div>
      <div>
        <Label htmlFor="remittanceAmountKrw">
          송금 금액 (정산 금액: {formatKRW(expectedAmountKrw)} 원)
        </Label>
        <Input
          id="remittanceAmountKrw"
          name="remittanceAmountKrw"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          정산 정보의 송금 금액과 일치해야 합니다.
        </p>
      </div>
      <div>
        <Label htmlFor="evidenceFile">송금 영수증 첨부 (선택, PDF/JPG/PNG, 10MB 이하)</Label>
        <Input
          id="evidenceFile"
          name="evidenceFile"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/jpg"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)] font-medium">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm text-[var(--color-success)] font-medium">
          {success}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "처리 중..." : "송금 완료 등록"}
      </Button>
    </form>
  );
}
