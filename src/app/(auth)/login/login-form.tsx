"use client";

// SPEC-AUTH-001 §2.1 REQ-AUTH-LOGIN-001/002, §2.9 REQ-AUTH-A11Y-001/002/003,
// §2.11 REQ-AUTH-ERROR-002.

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { login } from "./actions";

interface LoginFormProps {
  next: string;
}

// 로컬 dev 환경 빠른 로그인용 시드 자격증명. supabase/migrations/20260427000070_seed.sql +
// 20260428000020_e2e_seed_phase2.sql 와 1:1 일치. localhost/127.0.0.1 에서만 노출.
const DEV_TEST_ACCOUNTS: ReadonlyArray<{
  label: string;
  email: string;
  password: string;
}> = [
  { label: "관리자", email: "admin@algolink.local", password: "DevAdmin!2026" },
  { label: "운영자", email: "operator@algolink.local", password: "DevOperator!2026" },
  { label: "운영자2", email: "operator2@algolink.local", password: "DevOperator2!2026" },
  { label: "강사", email: "instructor1@algolink.local", password: "DevInstructor!2026" },
];

export function LoginForm({ next }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const [showPw, setShowPw] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isDevHost, setIsDevHost] = React.useState(false);

  // 클라이언트 마운트 시 hostname 확인 — localhost/127.0.0.1 에서만 dev 패널 노출.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    setIsDevHost(host === "localhost" || host === "127.0.0.1" || host.endsWith(".local"));
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    const fd = new FormData();
    fd.set("email", values.email);
    fd.set("password", values.password);
    if (next) fd.set("next", next);

    // 성공 시 Server Action 내부에서 redirect()가 throw 되어 이 라인 너머는 실행되지 않는다.
    const result = await login(fd);
    if (result?.error) {
      setServerError(result.error);
      // 첫 invalid 필드로 포커스 (REQ-AUTH-A11Y-002).
      setError("password", { type: "server", message: result.error });
      setFocus("password");
    }
  });

  // 클라이언트 검증 에러가 있으면 첫 invalid 필드로 포커스.
  React.useEffect(() => {
    if (errors.email) {
      setFocus("email");
    } else if (errors.password) {
      setFocus("password");
    }
  }, [errors.email, errors.password, setFocus]);

  const errorMessage =
    serverError ??
    errors.email?.message ??
    (errors.password?.type !== "server" ? errors.password?.message : undefined);

  // 개발 환경 빠른 로그인: 클릭 시 자격증명 자동 입력 + 즉시 폼 제출.
  const fillAndSubmit = React.useCallback(
    (email: string, password: string) => {
      setValue("email", email, { shouldValidate: false });
      setValue("password", password, { shouldValidate: false });
      // setValue 가 controlled state 를 업데이트한 다음 tick 에서 submit.
      setTimeout(() => {
        void onSubmit();
      }, 0);
    },
    [setValue, onSubmit],
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {isDevHost ? (
        <div
          className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-bg-muted)] px-3 py-2.5 text-xs"
          role="region"
          aria-label="개발 환경 빠른 로그인"
        >
          <p className="font-semibold text-[var(--color-text-muted)] mb-1.5">
            개발 환경 빠른 로그인 (시드 계정)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DEV_TEST_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                disabled={isSubmitting}
                onClick={() => fillAndSubmit(acc.email, acc.password)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 font-mono hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                title={`${acc.email} 으로 즉시 로그인`}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email" required>
          이메일
        </Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          disabled={isSubmitting}
          aria-invalid={Boolean(errors.email) || Boolean(serverError)}
          aria-describedby={errorMessage ? "login-error" : undefined}
          placeholder="name@algolink.com"
          {...register("email")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password" required>
          비밀번호
        </Label>
        <div className="relative">
          <Input
            id="login-password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.password) || Boolean(serverError)}
            aria-describedby={errorMessage ? "login-error" : undefined}
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
      </div>

      {errorMessage ? (
        <p
          id="login-error"
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-md bg-[var(--color-state-alert-muted)] border border-[var(--color-state-alert)]/30 px-3 py-2 text-sm text-[var(--color-state-alert)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{errorMessage}</span>
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isSubmitting}
        size="lg"
        className="mt-2"
      >
        {isSubmitting ? "로그인 중…" : "로그인"}
      </Button>

      <div className="text-center text-sm">
        <Link
          href="/forgot-password"
          className="text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded"
        >
          비밀번호를 잊으셨나요?
        </Link>
      </div>
    </form>
  );
}
