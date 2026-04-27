"use client";

// SPEC-AUTH-001 §2.4 REQ-AUTH-INVITE-004, §2.9 REQ-AUTH-A11Y-001/002/003.

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setPasswordSchema,
  type SetPasswordInput,
} from "@/lib/validation/auth";
import { acceptInvite } from "./actions";

export function SetPasswordForm() {
  const {
    register,
    handleSubmit,
    setFocus,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onSubmit",
  });

  const [showPw, setShowPw] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    const fd = new FormData();
    fd.set("password", values.password);
    fd.set("confirmPassword", values.confirmPassword);

    // 성공 시 Server Action 내부 redirect()가 throw 되어 이 라인 너머는 실행되지 않는다.
    const result = await acceptInvite(fd);
    if (result?.error) {
      setServerError(result.error);
      setError("password", { type: "server", message: result.error });
      setFocus("password");
    }
  });

  React.useEffect(() => {
    if (errors.password && errors.password.type !== "server") {
      setFocus("password");
    } else if (errors.confirmPassword) {
      setFocus("confirmPassword");
    }
  }, [errors.password, errors.confirmPassword, setFocus]);

  const errorMessage =
    serverError ??
    (errors.password?.type !== "server"
      ? errors.password?.message
      : undefined) ??
    errors.confirmPassword?.message;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="set-password" required>
          비밀번호
        </Label>
        <div className="relative">
          <Input
            id="set-password"
            type={showPw ? "text" : "password"}
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.password) || Boolean(serverError)}
            aria-describedby={errorMessage ? "set-password-error" : undefined}
            className="pr-9"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            aria-pressed={showPw}
            aria-label={showPw ? "비밀번호 숨김" : "비밀번호 표시"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)] hover:text-[var(--color-text)] transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            {showPw ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-subtle)]">
          12자 이상이며 대소문자/숫자/특수문자 중 3가지 이상을 포함해야 합니다.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="set-password-confirm" required>
          비밀번호 확인
        </Label>
        <div className="relative">
          <Input
            id="set-password-confirm"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.confirmPassword)}
            aria-describedby={errorMessage ? "set-password-error" : undefined}
            className="pr-9"
            {...register("confirmPassword")}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((s) => !s)}
            aria-pressed={showConfirm}
            aria-label={showConfirm ? "비밀번호 숨김" : "비밀번호 표시"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)] hover:text-[var(--color-text)] transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            {showConfirm ? (
              <EyeOff className="h-4 w-4" aria-hidden />
            ) : (
              <Eye className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p
          id="set-password-error"
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-md bg-[var(--color-state-alert-muted)] border border-[var(--color-state-alert)]/30 px-3 py-2 text-sm text-[var(--color-state-alert)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{errorMessage}</span>
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} size="lg" className="mt-2">
        {isSubmitting ? "설정 중…" : "비밀번호 설정"}
      </Button>
    </form>
  );
}
