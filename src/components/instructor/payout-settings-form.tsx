"use client";

// SPEC-ME-001 §2.7 REQ-ME-PAYOUT — 지급 정보 폼 (mock 제출).
// 실제 Server Action은 SPEC-DB-002 RPC 정착 후 연결.
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

export function PayoutSettingsForm() {
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setDone(false);
    const fd = new FormData(e.currentTarget);
    const input = {
      residentNumber: String(fd.get("residentNumber") ?? ""),
      bankName: String(fd.get("bankName") ?? ""),
      bankAccount: String(fd.get("bankAccount") ?? ""),
      accountHolder: String(fd.get("accountHolder") ?? ""),
      businessNumber: String(fd.get("businessNumber") ?? ""),
      withholdingTaxRate: String(fd.get("withholdingTaxRate") ?? "3.30"),
    };
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
    // @MX:TODO: Server Action 연결 (SPEC-DB-002 RPC 정착 후).
    setTimeout(() => {
      setSubmitting(false);
      setDone(true);
      // 폼 평문 즉시 폐기.
      (e.target as HTMLFormElement).reset();
    }, 600);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        label="주민등록번호"
        name="residentNumber"
        placeholder="000000-0000000"
        error={errors["residentNumber"]}
        required
      />
      <Field
        label="거래은행"
        name="bankName"
        placeholder="국민은행"
        error={errors["bankName"]}
        required
      />
      <Field
        label="계좌번호"
        name="bankAccount"
        placeholder="000-000000-00-000"
        error={errors["bankAccount"]}
        required
      />
      <Field
        label="예금주"
        name="accountHolder"
        placeholder="홍길동"
        error={errors["accountHolder"]}
        required
      />
      <Field
        label="사업자등록번호 (선택)"
        name="businessNumber"
        placeholder="000-00-00000"
        error={errors["businessNumber"]}
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="withholdingTaxRate" required>
          원천징수율
        </Label>
        <Select name="withholdingTaxRate" defaultValue="3.30">
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
            PDF / JPG / PNG · 최대 5MB · Storage `payout-documents` 버킷에 본인만 read/write 가능
          </p>
        </div>
      </div>

      {done && (
        <p role="status" className="text-sm text-[var(--color-state-info)]">
          저장되었습니다. (mock — 실제 암호화 저장은 SPEC-DB-002 RPC 정착 후)
        </p>
      )}

      <div className="flex gap-2 mt-2">
        <Button type="submit" disabled={submitting}>
          <Save /> 저장
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  placeholder,
  error,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  const id = `field-${name}`;
  const errId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        placeholder={placeholder}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errId : undefined}
      />
      {error && (
        <p id={errId} role="alert" className="text-xs text-[var(--color-state-alert)]">
          {error}
        </p>
      )}
    </div>
  );
}
