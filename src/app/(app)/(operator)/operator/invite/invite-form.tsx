"use client";

// SPEC-AUTH-001 §2.4 REQ-AUTH-INVITE-001/002.

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2 } from "lucide-react";
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
import { inviteSchema, type InviteInput } from "@/lib/validation/auth";
import { inviteUser } from "./actions";
import type { UserRole } from "@/auth/roles";

interface InviteFormProps {
  currentRole: UserRole;
}

export function InviteForm({ currentRole }: InviteFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", invited_role: "instructor" },
    mode: "onSubmit",
  });

  // Radix Select 값을 RHF 외부에서 관리하여 React Compiler 호환성 확보.
  const [role, setRole] =
    React.useState<InviteInput["invited_role"]>("instructor");
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);

  // role 상태와 RHF 값을 동기화 (제출/검증용).
  React.useEffect(() => {
    register("invited_role");
  }, [register]);
  React.useEffect(() => {
    setValue("invited_role", role, { shouldValidate: false });
  }, [role, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setSuccessMsg(null);

    const fd = new FormData();
    fd.set("email", values.email);
    fd.set("invited_role", values.invited_role);

    const result = await inviteUser(fd);
    if (result?.error) {
      setServerError(result.error);
      setFocus("email");
      return;
    }
    if (result?.success) {
      setSuccessMsg(result.success);
      reset({ email: "", invited_role: "instructor" });
      setRole("instructor");
    }
  });

  React.useEffect(() => {
    if (errors.email) setFocus("email");
  }, [errors.email, setFocus]);

  const errorMessage = serverError ?? errors.email?.message;
  const canInviteAdmin = currentRole === "admin";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email" required>
          이메일
        </Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="email"
          disabled={isSubmitting}
          aria-invalid={Boolean(errors.email) || Boolean(serverError)}
          aria-describedby={errorMessage ? "invite-error" : undefined}
          placeholder="invitee@algolink.com"
          {...register("email")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role" required>
          역할
        </Label>
        <Select
          value={role}
          onValueChange={(v) => setRole(v as InviteInput["invited_role"])}
          disabled={isSubmitting}
        >
          <SelectTrigger id="invite-role" aria-label="초대할 역할 선택">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instructor">강사 (instructor)</SelectItem>
            <SelectItem value="operator">운영자 (operator)</SelectItem>
            {canInviteAdmin ? (
              <SelectItem value="admin">관리자 (admin)</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
        {!canInviteAdmin ? (
          <p className="text-xs text-[var(--color-text-subtle)]">
            관리자 초대는 admin 권한이 필요합니다.
          </p>
        ) : null}
      </div>

      {errorMessage ? (
        <p
          id="invite-error"
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-md bg-[var(--color-state-alert-muted)] border border-[var(--color-state-alert)]/30 px-3 py-2 text-sm text-[var(--color-state-alert)]"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{errorMessage}</span>
        </p>
      ) : null}

      {successMsg ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md bg-[var(--color-state-in-progress-muted)] border border-[var(--color-state-in-progress)]/30 px-3 py-2 text-sm text-[var(--color-state-in-progress)]"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>{successMsg}</span>
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? "발송 중…" : "초대 발송"}
      </Button>
    </form>
  );
}
