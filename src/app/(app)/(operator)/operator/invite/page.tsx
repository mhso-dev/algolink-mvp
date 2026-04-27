// SPEC-AUTH-001 §2.4 REQ-AUTH-INVITE-001/002/006/007.
// 운영자/관리자 전용 초대 발급 페이지.
// 가드는 `(operator)/layout.tsx`의 `requireRole(["operator", "admin"])`에서 선행 처리됨.

import { UserPlus } from "lucide-react";
import { getCurrentUser, getServerSupabase } from "@/auth/server";
import { Card } from "@/components/ui/card";
import { InviteForm } from "./invite-form";
import { PendingInvitations, type PendingInvitation } from "./pending-list";

export const metadata = {
  title: "사용자 초대",
};

export const dynamic = "force-dynamic";

export default async function OperatorInvitePage() {
  // layout 가드를 통과했으므로 user는 항상 operator 또는 admin.
  const user = await getCurrentUser();
  const currentRole = user?.role ?? "operator";

  const supabase = await getServerSupabase();
  // RLS user_invitations_operator_select 정책에 따라 operator/admin은 모든 행 조회 가능.
  // @MX:NOTE: user_invitations 테이블 타입 미생성 — `as any` 캐스팅 (auth/events.ts와 동일 패턴).
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
          사용자 초대
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          이메일로 초대 링크를 발송합니다. 초대받은 사용자는 비밀번호를 설정한
          뒤 지정된 역할로 로그인할 수 있습니다.
        </p>
      </header>

      <Card className="p-6">
        <InviteForm currentRole={currentRole} />
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
