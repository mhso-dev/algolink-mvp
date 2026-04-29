// SPEC-PAYOUT-002 §M5 REQ-PAYOUT002-GENERATE-001/-002 — 정산 일괄 생성 페이지.
// operator/admin 전용. period selector + 미리보기 + "정산 생성" 버튼.

import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/auth/guards";
import { Container } from "@/components/app/container";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKRW } from "@/lib/utils";
import { buildSettlementPreview } from "@/lib/payouts/generate";
import { SETTLEMENT_FLOW_LABEL } from "@/lib/payouts/types";
import { GenerateSettlementsForm } from "@/components/payouts/generate-settlements-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function defaultMonth(): { start: string; end: string; raw: string } {
  const now = new Date();
  // KST 기준 (UTC+9)
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  // 다음 달 1일 - 1일 = 해당 월의 마지막 날
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, raw: `${y}-${String(m).padStart(2, "0")}` };
}

export default async function GenerateSettlementsPage({ searchParams }: PageProps) {
  await requireRole(["operator", "admin"]);
  const supabase = createClient(await cookies());

  const raw = await searchParams;
  const periodStart =
    typeof raw.period_start === "string" ? raw.period_start : null;
  const periodEnd = typeof raw.period_end === "string" ? raw.period_end : null;
  const def = defaultMonth();
  const start = periodStart ?? def.start;
  const end = periodEnd ?? def.end;

  // 미리보기 빌드 (REQ-GENERATE-005)
  const preview = await buildSettlementPreview(supabase, {
    periodStart: start,
    periodEnd: end,
  });

  // 프로젝트 메타 (제목 표시용)
  const projectIds = preview.rows.map((r) => r.project_id);
  const { data: projectsData } =
    projectIds.length > 0
      ? await supabase
          .from("projects")
          .select("id, title")
          .in("id", projectIds)
      : { data: [] as Array<{ id: string; title: string }> };
  const projectTitleById = new Map<string, string>();
  for (const p of (projectsData ?? []) as Array<{ id: string; title: string }>) {
    projectTitleById.set(p.id, p.title);
  }

  // 강사 메타 (이름 표시용)
  const instructorIds = preview.rows
    .map((r) => r.instructor_id)
    .filter((i): i is string => Boolean(i));
  const { data: instructorsData } =
    instructorIds.length > 0
      ? await supabase
          .from("instructors_safe")
          .select("id, name_kr")
          .in("id", instructorIds)
      : { data: [] as Array<{ id: string; name_kr: string }> };
  const instructorNameById = new Map<string, string>();
  for (const i of (instructorsData ?? []) as Array<{ id: string; name_kr: string }>) {
    instructorNameById.set(i.id, i.name_kr);
  }

  return (
    <Container variant="narrow" className="flex flex-col gap-6 py-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="min-h-touch min-w-touch">
            <Link href="/settlements" aria-label="정산 목록으로 돌아가기">
              <ChevronLeft />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">정산 일괄 생성</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              기간 내 완료된 강의를 자동으로 정산 행으로 생성합니다.
            </p>
          </div>
        </div>
      </header>

      {/* 기간 선택 + 미리보기 표 */}
      <Card>
        <CardHeader>
          <CardTitle>기간 선택</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <form
            action="/settlements/generate"
            method="GET"
            className="flex flex-wrap items-end gap-3"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span>시작일</span>
              <input
                type="date"
                name="period_start"
                defaultValue={start}
                className="rounded-md border px-3 py-2 text-sm min-h-touch"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>종료일</span>
              <input
                type="date"
                name="period_end"
                defaultValue={end}
                className="rounded-md border px-3 py-2 text-sm min-h-touch"
                required
              />
            </label>
            <Button type="submit" variant="secondary">
              미리보기 갱신
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            미리보기 — {preview.unbilledCount}건 청구 / {preview.projectCount}개 프로젝트
          </CardTitle>
        </CardHeader>
        <CardContent>
          {preview.rows.length === 0 ? (
            // REQ-PAYOUT002-GENERATE-006
            <p className="text-sm text-[var(--color-text-muted)]">
              선택한 기간에 청구할 강의가 없습니다.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>프로젝트</TableHead>
                    <TableHead>강사</TableHead>
                    <TableHead className="text-right">시수</TableHead>
                    <TableHead className="text-right">사업비</TableHead>
                    <TableHead className="text-right">강사비</TableHead>
                    <TableHead>흐름</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.project_id}>
                      <TableCell className="font-medium">
                        {projectTitleById.get(row.project_id) ?? row.project_id}
                      </TableCell>
                      <TableCell>
                        {row.instructor_id
                          ? (instructorNameById.get(row.instructor_id) ?? "-")
                          : "(미배정)"}
                      </TableCell>
                      <TableCell className="text-right">{row.total_hours}h</TableCell>
                      <TableCell className="text-right">
                        {formatKRW(row.business_amount_krw)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatKRW(row.instructor_fee_krw)}
                      </TableCell>
                      <TableCell>
                        {row.default_flow
                          ? SETTLEMENT_FLOW_LABEL[row.default_flow]
                          : "(선택 필요)"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-6">
                <GenerateSettlementsForm
                  rows={preview.rows.map((r) => ({
                    project_id: r.project_id,
                    project_title: projectTitleById.get(r.project_id) ?? r.project_id,
                    instructor_name: r.instructor_id
                      ? (instructorNameById.get(r.instructor_id) ?? "-")
                      : "(미배정)",
                    total_hours: r.total_hours,
                    business_amount_krw: r.business_amount_krw,
                    instructor_fee_krw: r.instructor_fee_krw,
                    default_flow: r.default_flow,
                  }))}
                  periodStart={start}
                  periodEnd={end}
                  unbilledCount={preview.unbilledCount}
                  projectCount={preview.projectCount}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
