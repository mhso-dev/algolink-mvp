import { Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await requireUser();
  if (session.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-[var(--color-primary)]" />
          회원 / 권한
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          시스템 사용자의 역할과 활성 상태를 관리합니다. (관리자 전용)
        </p>
      </header>

      <Card>
        <CardContent className="py-16 text-center text-sm text-[var(--color-text-muted)]">
          관리자 회원 관리 (다음 단계에서 구현)
        </CardContent>
      </Card>
    </div>
  );
}
