"use client";
// SPEC-ADMIN-001 §3.2 F-301 — is_active 토글 폼 (Server Action wrapper).
import { useActionState } from "react";
import {
  setUserActiveAction,
  type SetActiveActionState,
} from "@/app/(app)/(admin)/admin/users/[id]/active/actions";

const INITIAL: SetActiveActionState = { ok: false, message: null };

export function ActiveForm({
  targetUserId,
  isActive,
}: {
  targetUserId: string;
  isActive: boolean;
}) {
  const [state, action, pending] = useActionState(setUserActiveAction, INITIAL);
  const next = isActive ? "false" : "true";
  return (
    <form action={action} className="flex gap-2 items-end">
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <input type="hidden" name="nextActive" value={next} />
      <button
        type="submit"
        disabled={pending}
        className={`border rounded px-3 py-1 text-sm text-white disabled:opacity-60 ${
          isActive ? "bg-red-600" : "bg-[var(--color-primary)]"
        }`}
      >
        {pending ? "처리 중…" : isActive ? "비활성화" : "활성화"}
      </button>
      {state.message ? (
        <span
          className={`text-xs ${state.ok ? "text-[var(--color-primary)]" : "text-red-600"}`}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
