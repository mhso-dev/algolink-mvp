"use client";

// SPEC-ME-001 §2.7 REQ-ME-PAYOUT-001~009 — 지급 정보 폼.
// @MX:WARN: 평문 PII 는 form state 에 잠시 머무른 뒤 저장 직후 reset() 으로 폐기한다.
// @MX:REASON: localStorage / React DevTools 노출 차단 (REQ-ME-PAYOUT-004).
import * as React from "react";
import { Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { payoutInputSchema } from "@/lib/validation/instructor";
import type { MaskedPayout } from "@/lib/instructor/payout-queries";
import {
  savePayoutInfoAction,
  type PayoutActionResult,
} from "@/app/(app)/(instructor)/me/settings/payout/actions";

interface Props {
  initial: MaskedPayout;
}

export function PayoutSettingsForm({ initial }: Props) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [resultMsg, setResultMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setResultMsg(null);

    const fd = new FormData(e.currentTarget);
    const input = {
      residentNumber: String(fd.get("residentNumber") ?? ""),
      bankName: String(fd.get("bankName") ?? ""),
      bankAccount: String(fd.get("bankAccount") ?? ""),
      accountHolder: String(fd.get("accountHolder") ?? ""),
      businessNumber: String(fd.get("businessNumber") ?? ""),
      withholdingTaxRate: String(fd.get("withholdingTaxRate") ?? "3.30"),
    };

    if (
      input.residentNumber.includes("*") ||
      input.bankAccount.includes("*") ||
      input.businessNumber.includes("*")
    ) {
      setErrors({ _form: "마스킹된 기존 값은 그대로 저장할 수 없습니다. 새 값을 다시 입력해주세요." });
      return;
    }

    const r = payoutInputSchema.safeParse(input);
    if (!r.success) {
      const next: Record<string, string> = {};
      for (const issue of r.error.issues) {
        const key = issue.path.join(".");
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    let result: PayoutActionResult;
    try {
      result = await savePayoutInfoAction(fd);
    } catch (err) {
      setSubmitting(false);
      setResultMsg({ kind: "err", text: (err as Error).message || "저장 실패" });
      return;
    }
    setSubmitting(false);

    if (!result.ok) {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      setResultMsg({ kind: "err", text: result.message ?? "저장에 실패했습니다." });
      return;
    }

    formRef.current?.reset();
    setResultMsg({ kind: "ok", text: result.message ?? "저장되었습니다." });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        label="주민등록번호"
        name="residentNumber"
        placeholder={initial.hasResidentNumber ? initial.residentNumberMasked : "000000-0000000"}
        helper={
          initial.hasResidentNumber
            ? `현재 등록: ${initial.residentNumberMasked} — 변경하려면 13자리를 새로 입력하세요.`
            : undefined
        }
        error={errors["residentNumber"]}
        required
      />
      <Field
        label="거래은행"
        name="bankName"
        defaultValue={initial.bankName}
        placeholder="국민은행"
        error={errors["bankName"]}
        required
      />
      <Field
        label="계좌번호"
        name="bankAccount"
        placeholder={initial.hasBankAccount ? initial.bankAccountMasked : "000-000000-00-000"}
        helper={
          initial.hasBankAccount
            ? `현재 등록: ${initial.bankAccountMasked} — 변경하려면 전체 번호를 새로 입력하세요.`
            : undefined
        }
        error={errors["bankAccount"]}
        required
      />
      <Field
        label="예금주"
        name="accountHolder"
        defaultValue={initial.accountHolder}
        placeholder="홍길동"
        error={errors["accountHolder"]}
        required
      />
      <Field
        label="사업자등록번호 (선택)"
        name="businessNumber"
        placeholder={initial.hasBusinessNumber ? initial.businessNumberMasked : "000-00-00000"}
        helper={
          initial.hasBusinessNumber ? `현재 등록: ${initial.businessNumberMasked}` : undefined
        }
        error={errors["businessNumber"]}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="withholdingTaxRate" required>
          원천징수율
        </Label>
        <Select name="withholdingTaxRate" defaultValue={initial.withholdingTaxRate}>
          <SelectTrigger id="withholdingTaxRate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3.30">3.30% (인건비, 일반)</SelectItem>
            <SelectItem value="8.80">8.80% (인건비, 사업소득)</SelectItem>
            <SelectItem value="0">0% (세금계산서)</SelectItem>
          </SelectContent>
        </Select>
        {errors["withholdingTaxRate"] && (
          <p role="alert" className="text-xs text-[var(--color-state-alert)]">
            {errors["withholdingTaxRate"]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>통장사본 첨부</Label>
        <div className="rounded-md border-2 border-dashed border-[var(--color-border-strong)] p-4 text-center">
          <Upload className="h-5 w-5 mx-auto mb-1 text-[var(--color-text-subtle)]" />
          <p className="text-xs text-[var(--color-text-muted)]">
            PDF / JPG / PNG · 최대 5MB · Storage `payout-documents` 버킷 (SPEC-DB-002 후속)
          </p>
        </div>
      </div>

      {errors["_form"] && (
        <p role="alert" className="text-sm text-[var(--color-state-alert)]">
          {errors["_form"]}
        </p>
      )}

      {resultMsg && (
        <p
          role={resultMsg.kind === "ok" ? "status" : "alert"}
          className={
            resultMsg.kind === "ok"
              ? "text-sm text-[var(--color-state-info)]"
              : "text-sm text-[var(--color-state-alert)]"
          }
        >
          {resultMsg.text}
        </p>
      )}

      <div className="flex gap-2 mt-2">
        <Button type="submit" disabled={submitting}>
          <Save /> {submitting ? "저장 중..." : "저장"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  placeholder,
  defaultValue,
  helper,
  error,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  helper?: string;
  error?: string;
  required?: boolean;
}) {
  const id = `field-${name}`;
  const errId = `${id}-error`;
  const helpId = `${id}-help`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errId : helper ? helpId : undefined}
      />
      {helper && !error && (
        <p id={helpId} className="text-xs text-[var(--color-text-muted)]">
          {helper}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs text-[var(--color-state-alert)]">
          {error}
        </p>
      )}
    </div>
  );
}
