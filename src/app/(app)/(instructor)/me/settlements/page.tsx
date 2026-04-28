// SPEC-ME-001 §2.6 REQ-ME-SET-001~008 — 강사 본인 정산 조회 (월별 그룹 + flow 분기 + 합계).
import { Receipt } from "lucide-react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ensureInstructorRow } from "@/lib/instructor/me-queries";
import { getMySettlements } from "@/lib/instructor/settlement-queries";
import {
  groupByMonth,
  breakdownByFlow,
} from "@/lib/instructor/settlement-grouping";
import { summarizeSettlements } from "@/lib/instructor/settlement-summary";
import { SettlementList } from "@/components/instructor/settlement-list";
import { SettlementSummaryWidget } from "@/components/instructor/settlement-summary-widget";

export const dynamic = "force-dynamic";

export default async function MySettlementsPage() {
  const session = await requireUser();
  if (session.role !== "instructor") {
    redirect("/dashboard");
  }
  const ctx = await ensureInstructorRow();
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 text-center text-sm text-[var(--color-text-muted)]">
        강사 프로필 초기화에 실패했습니다. 잠시 후 다시 시도해주세요.
      </div>
    );
  }

  const records = await getMySettlements(ctx.instructorId);
  const total = summarizeSettlements(records);
  const byFlow = breakdownByFlow(records);
  const monthly = groupByMonth(records);

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="h-6 w-6 text-[var(--color-primary)]" />
          내 정산
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {session.displayName}님의 강사료 정산 내역. 인건비(3.3% / 8.8%) 처리와 세금계산서 처리는
          상단 카드에서 합계로 분리해 표시합니다.
        </p>
      </header>

      <SettlementSummaryWidget total={total} byFlow={byFlow} />

      {records.length === 0 ? (
        <div
          className="rounded-md border border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-text-muted)]"
          role="status"
        >
          아직 정산 내역이 없어요.
        </div>
      ) : (
        <SettlementList groups={monthly} />
      )}
    </div>
  );
}
