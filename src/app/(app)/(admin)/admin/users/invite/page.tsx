import { UserPlus } from "lucide-react";
import { requireRole } from "@/auth/guards";
import { getServerSupabase } from "@/auth/server";
import { Card } from "@/components/ui/card";
import { InviteForm } from "@/app/(app)/(operator)/operator/invite/invite-form";
import {
  PendingInvitations,
  type PendingInvitation,
} from "@/app/(app)/(operator)/operator/invite/pending-list";

export const dynamic = "force-dynamic";

export default async function AdminUserInvitePage() {
  await requireRole(["admin"]);
  const supabase = await getServerSupabase();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("user_invitations")
    .select("id, email, invited_role, invited_by, expires_at, created_at")
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const pending = ((data ?? []) as PendingInvitation[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UserPlus className="h-6 w-6 text-[var(--color-primary)]" />
          새 사용자 초대
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          관리자 계정에서 직접 운영자·강사·관리자 초대를 발급합니다.
        </p>
      </header>

      <Card className="p-6">
        <InviteForm currentRole="admin" />
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">대기 중인 초대</h2>
          <span className="text-sm text-[var(--color-text-muted)]">
            {pending.length}건
          </span>
        </div>
        {error ? (
          <Card className="border-[var(--color-state-alert)] p-4">
            <p className="text-sm text-[var(--color-state-alert)]">
              초대 목록을 불러오지 못했습니다: {error.message}
            </p>
          </Card>
        ) : (
          <PendingInvitations invitations={pending} />
        )}
      </section>
    </div>
  );
}
