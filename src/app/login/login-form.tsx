"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";
import * as React from "react";

const initialState: LoginState = { error: null };

function NextHidden() {
  const next = useSearchParams().get("next");
  if (!next) return null;
  return <input type="hidden" name="next" value={next} />;
}

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, initialState);
  const [showPw, setShowPw] = React.useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <NextHidden />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" required>
          이메일
        </Label>
        <Input
          id="email"
          type="email"
          name="email"
          required
          autoComplete="email"
          disabled={isPending}
          placeholder="name@algolink.com"
          aria-invalid={Boolean(state.error)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" required>
          비밀번호
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPw ? "text" : "password"}
            name="password"
            required
            autoComplete="current-password"
            disabled={isPending}
            aria-invalid={Boolean(state.error)}
            className="pr-9"
          />
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)] hover:text-[var(--color-text)] transition-colors p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
          >
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md bg-[var(--color-state-alert-muted)] border border-[var(--color-state-alert)]/30 px-3 py-2 text-sm text-[var(--color-state-alert)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <Button type="submit" disabled={isPending} size="lg" className="mt-2">
        {isPending ? "로그인 중…" : "로그인"}
      </Button>
    </form>
  );
}
