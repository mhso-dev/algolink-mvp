import { cookies } from "next/headers";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, Receipt, FileText, ChevronRight, Sparkles } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { formatKRW } from "@/lib/utils";
import { SETTLEMENT_STATUS_LABEL, settlementStatusBadgeVariant } from "@/lib/projects";
import {
  summarizeSettlements,
  type SettlementInput,
} from "@/lib/instructor/settlement-summary";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

export default async function InstructorDashboardPage() {
  const session = await requireUser();
  const supabase = createClient(await cookies());

  // 강사 본인의 프로젝트 + 정산 — RLS가 자동 필터
  const [upcomingRes, settlementsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, education_start_at, education_end_at, status")
      .gte("education_start_at", new Date().toISOString())
      .order("education_start_at", { ascending: true })
      .limit(5)
      .returns<{ id: string; title: string; education_start_at: string | null; education_end_at: string | null; status: string }[]>(),
    supabase
      .from("settlements")
      .select("id, status, instructor_fee_krw, withholding_tax_amount_krw, settlement_flow")
      .order("created_at", { ascending: false })
      .returns<{ id: string; status: string; instructor_fee_krw: number; withholding_tax_amount_krw: number; settlement_flow: string }[]>(),
  ]);

  const upcoming = upcomingRes.data ?? [];
  const settlements = settlementsRes.data ?? [];

  // SPEC-ME-001 §2.6 REQ-ME-SET-004 — settlement-summary 단일 진실 공급원 사용.
  const summaryRows: SettlementInput[] = settlements.map((s) => ({
    status: s.status as SettlementInput["status"],
    settlementFlow: s.settlement_flow as SettlementInput["settlementFlow"],
    instructorFeeKrw: s.instructor_fee_krw,
    // settlement_flow에 맞춰 0 / 3.30 / 8.80을 추론 (DB withholding_tax_amount_krw는 generated이므로 합계 검증용).
    withholdingTaxRate:
      s.settlement_flow === "corporate"
        ? 0
        : s.withholding_tax_amount_krw && s.instructor_fee_krw
          ? Number(((s.withholding_tax_amount_krw / s.instructor_fee_krw) * 100).toFixed(2)) === 3.3
            ? 3.3
            : 8.8
          : 3.3,
  }));
  const summary = summarizeSettlements(summaryRows);
  // BigInt → Number (대시보드 표시용; 9천조 미만 안전).
  const pendingTotal = Number(summary.unsettledNetKrw);
  const yearTotal = settlements
    .filter((s) => s.status === "paid")
    .reduce(
      (sum, s) => sum + s.instructor_fee_krw - (s.withholding_tax_amount_krw ?? 0),
      0,
    );

  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          안녕하세요, <span className="text-[var(--color-primary)]">{session.displayName}</span>님
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          오늘도 알고링크와 함께해 주셔서 감사합니다.
        </p>
      </header>

      {/* 알림 배너 (placeholder) */}
      <Card className="border-l-4 border-l-[var(--color-state-info)] bg-[var(--color-state-info-muted)]/40 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-[var(--color-state-info)] mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-[var(--color-text)]">알림 시스템 준비 중</p>
            <p className="text-[var(--color-text-muted)] mt-0.5">
              배정 요청·일정 변경·정산 안내가 여기에 표시됩니다.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 다가오는 일정 */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> 다가오는 일정
              </CardTitle>
              <CardDescription>앞으로 7일 이내 강의</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/me/schedule">
                전체 보기 <ChevronRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">
                다가오는 일정이 없어요.
              </p>
            ) : (
              upcoming.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-md border border-[var(--color-border)] p-3 hover:bg-[var(--color-neutral-50)] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-clamp-1">{p.title}</p>
                    <p className="text-xs text-[var(--color-text-muted)] font-tabular mt-0.5">
                      {p.education_start_at
                        ? format(new Date(p.education_start_at), "yyyy.MM.dd HH:mm", { locale: ko })
                        : "일정 미정"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* 정산 요약 */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" /> 정산 요약
              </CardTitle>
              <CardDescription>실수령 기준 (원천세 차감)</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/me/settlements">
                전체 보기 <ChevronRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-[var(--color-state-pending-muted)] p-3">
              <p className="text-xs text-[var(--color-state-pending)] font-medium">미정산</p>
              <p className="text-xl font-bold font-tabular mt-1">
                {formatKRW(pendingTotal, { sign: true })}
              </p>
            </div>
            <div className="rounded-md bg-[var(--color-state-settled-muted)] p-3">
              <p className="text-xs text-[var(--color-state-settled)] font-medium">누적 지급</p>
              <p className="text-xl font-bold font-tabular mt-1">
                {formatKRW(yearTotal, { sign: true })}
              </p>
            </div>
            <div className="col-span-2 mt-2 space-y-1.5">
              {settlements.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--color-text-muted)]">
                    {s.settlement_flow === "corporate" ? "기업" : "정부"}
                  </span>
                  <Badge variant={settlementStatusBadgeVariant(s.status)}>
                    {SETTLEMENT_STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 빠른 액션 */}
      <Card>
        <CardHeader>
          <CardTitle>빠른 액션</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2 items-start">
            <Link href="/me/resume">
              <FileText className="h-5 w-5 text-[var(--color-primary)]" />
              <div className="text-left">
                <p className="text-sm font-medium">이력서 관리</p>
                <p className="text-xs text-[var(--color-text-muted)] font-normal">
                  PDF 업로드로 자동 채우기
                </p>
              </div>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2 items-start">
            <Link href="/me/schedule">
              <CalendarDays className="h-5 w-5 text-[var(--color-primary)]" />
              <div className="text-left">
                <p className="text-sm font-medium">일정 관리</p>
                <p className="text-xs text-[var(--color-text-muted)] font-normal">
                  강의·개인 일정 통합
                </p>
              </div>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2 items-start">
            <Link href="/me/settlements">
              <Receipt className="h-5 w-5 text-[var(--color-primary)]" />
              <div className="text-left">
                <p className="text-sm font-medium">정산 조회</p>
                <p className="text-xs text-[var(--color-text-muted)] font-normal">
                  지급 내역·세금 처리
                </p>
              </div>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
}
