// SPEC-ME-001 §2.7 — 강사 설정 진입점.
import Link from "next/link";
import { Settings, CreditCard, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InstructorSettingsPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-[var(--color-primary)]" />
          설정
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          개인 정보·정산 지급 정보를 관리하세요.
        </p>
      </header>

      <Link href="/me/settings/payout" className="block">
        <Card className="hover:border-[var(--color-primary)] transition-colors">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-[var(--color-primary)]" />
              <div>
                <CardTitle className="text-base">지급 정보 관리</CardTitle>
                <CardDescription>
                  주민등록번호·계좌·통장사본·원천징수율 등록 (모두 암호화 저장)
                </CardDescription>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-[var(--color-text-muted)]" />
          </CardHeader>
          <CardContent />
        </Card>
      </Link>
    </div>
  );
}
