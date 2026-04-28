// SPEC-ADMIN-001 §3.2 F-301 — admin 회원 상세.
// 자기 자신의 비활성화 토글은 노출하지 않음 (B-8 UI 측 차단).
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/auth/guards";
import { getUserById } from "@/lib/admin/users/queries";
import { RoleForm } from "@/components/admin/users/role-form";
import { ActiveForm } from "@/components/admin/users/active-form";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireRole(["admin"]);
  const { id } = await params;
  const user = await getUserById(id);
  if (!user) {
    notFound();
  }

  const isSelf = actor.id === user.id;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-5">
      <nav>
        <Link href="/admin/users" className="text-sm underline text-[var(--color-primary)]">
          ← 회원 목록
        </Link>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>{user.nameKr}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div>
            <span className="text-[var(--color-text-muted)]">이메일: </span>
            <span className="font-mono">{user.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-muted)]">역할:</span>
            <Badge variant="outline">{user.role}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-text-muted)]">활성:</span>
            {user.isActive ? <Badge>활성</Badge> : <Badge variant="alert">비활성</Badge>}
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            생성일: {user.createdAt.toISOString().slice(0, 10)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>역할 변경</CardTitle>
        </CardHeader>
        <CardContent>
          {isSelf ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              본인 계정의 역할은 변경할 수 없습니다. (자가 lockout 방지)
            </p>
          ) : (
            <RoleForm targetUserId={user.id} currentRole={user.role} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>활성 상태</CardTitle>
        </CardHeader>
        <CardContent>
          {isSelf ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              본인 계정의 활성 상태는 변경할 수 없습니다.
            </p>
          ) : (
            <ActiveForm targetUserId={user.id} isActive={user.isActive} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
