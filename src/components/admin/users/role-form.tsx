"use client";
// SPEC-ADMIN-001 §3.2 F-301 — 역할 변경 폼 (Server Action wrapper).
import { useActionState } from "react";
import {
  updateUserRoleAction,
  type UpdateRoleActionState,
} from "@/app/(app)/(admin)/admin/users/[id]/role/actions";
import { ADMIN_USER_ROLES, type AdminUserRole } from "@/lib/admin/users/validation";

const INITIAL: UpdateRoleActionState = { ok: false, message: null };

export function RoleForm({
  targetUserId,
  currentRole,
}: {
  targetUserId: string;
  currentRole: AdminUserRole;
}) {
  const [state, action, pending] = useActionState(updateUserRoleAction, INITIAL);
  return (
    <form action={action} className="flex gap-2 items-end">
      <input type="hidden" name="targetUserId" value={targetUserId} />
      <label className="flex flex-col gap-1 text-sm">
        <span>새 역할</span>
        <select
          name="newRole"
          defaultValue={currentRole}
          disabled={pending}
          className="border rounded px-2 py-1 text-sm"
        >
          {ADMIN_USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="border rounded px-3 py-1 text-sm bg-[var(--color-primary)] text-white disabled:opacity-60"
      >
        {pending ? "변경 중…" : "변경"}
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
