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

export function LoginForm({ next }: LoginFormProps) {
  const {
    register,
    handleSubmit,
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

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
