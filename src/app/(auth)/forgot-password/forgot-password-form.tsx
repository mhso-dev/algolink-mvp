"use client";

// SPEC-AUTH-001 §2.3 REQ-AUTH-PASSWORD-003, §2.9 REQ-AUTH-A11Y-001/002/003,
// §2.11 REQ-AUTH-ERROR-002, §2.6 REQ-AUTH-SECURITY-007 (이메일 enumeration 방지).

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from "@/lib/validation/auth";
import { requestPasswordReset } from "./actions";

interface ForgotPasswordFormProps {
  initialError?: string;
  sent?: boolean;
}

export function ForgotPasswordForm({
  initialError,
  sent: initialSent,
}: ForgotPasswordFormProps) {
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "onSubmit",
  });

  const [serverError, setServerError] = React.useState<string | null>(
    initialError ?? null,
  );
  const [successMsg, setSuccessMsg] = React.useState<string | null>(
    initialSent ? "이메일을 발송했습니다. 받은편지함을 확인하세요." : null,
  );

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    const fd = new FormData();
    fd.set("email", values.email);

    const result = await requestPasswordReset(fd);
    if (result.error) {
      setServerError(result.error);
      setFocus("email");
      return;
    }
    if (result.success) {
      setSuccessMsg(result.success);
    }
  });

  // 클라이언트 검증 에러 → 첫 invalid 필드로 포커스 (REQ-AUTH-A11Y-002).
  React.useEffect(() => {
    if (errors.email) setFocus("email");
  }, [errors.email, setFocus]);

  const errorMessage = serverError ?? errors.email?.message;

  // 성공 상태: 폼 숨기고 안내 + 다시 보내기 링크.
  if (successMsg) {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md bg-[var(--color-state-success-muted)] border border-[var(--color-state-success)]/30 px-3 py-2 text-sm text-[var(--color-state-success)]"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{successMsg}</span>
        </p>
        <div className="text-center text-sm">
          <Link
            href="/forgot-password"
            className="text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded"
            onClick={() => setSuccessMsg(null)}
          >
            다시 보내기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="forgot-email" required>
          이메일
        </Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          disabled={isSubmitting}
          aria-invalid={Boolean(errors.email) || Boolean(serverError)}
          aria-describedby={errorMessage ? "forgot-error" : undefined}
          placeholder="name@algolink.com"
          {...register("email")}
        />
      </div>

      {errorMessage ? (
        <p
          id="forgot-error"
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-md bg-[var(--color-state-alert-muted)] border border-[var(--color-state-alert)]/30 px-3 py-2 text-sm text-[var(--color-state-alert)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{errorMessage}</span>
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} size="lg" className="mt-2">
        {isSubmitting ? "발송 중…" : "재설정 이메일 발송"}
      </Button>

      <div className="text-center text-sm">
        <Link
          href="/login"
          className="text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded"
        >
          로그인으로 돌아가기
        </Link>
      </div>
    </form>
  );
}
