// SPEC-PAYOUT-001 §2.1, §2.6 — 정산 리스트 + 필터 + 매입매출 위젯.
// @MX:NOTE: SPEC-MOBILE-001 §M4 — <md 카드 list, >=md 기존 테이블.

import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Receipt, Send } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/auth/guards";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatKRW } from "@/lib/utils";
import {
  parsePayoutsQuery,
  computePayoutPagination,
  serializePayoutsQuery,
  parsePeriod,
  listSettlements,
  computeMonthlyAggregate,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_FLOW_LABEL,
  settlementStatusBadgeVariant,
  type PayoutPeriod,
} from "@/lib/payouts";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function defaultMonthPeriod(): PayoutPeriod {
  const now = new Date();
  // KST 기준 월 — UTC + 9 보정.
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  return { kind: "month", raw: `${y}-${m}` };
}

export default async function SettlementsListPage({ searchParams }: PageProps) {
  await requireRole(["operator", "admin"]);
  const supabase = createClient(await cookies());

  const raw = await searchParams;
  const query = parsePayoutsQuery(raw);
  const period =
    query.period ?? parsePeriod(typeof raw.period === "string" ? raw.period : null) ?? defaultMonthPeriod();

  // 리스트 + 위젯 병렬 조회.
  const [listResult, aggregate, instructors, projects] = await Promise.all([
    listSettlements(supabase, { ...query, period }),
    computeMonthlyAggregate(supabase, period, "created"),
    supabase.from("instructors_safe").select("id, name_kr"),
    supabase.from("projects").select("id, title"),
  ]);

  // page over-flow → redirect
  const pagination = computePayoutPagination(
    listResult.total,
    query.page,
    query.pageSize,
  );
  if (pagination.needsRedirect) {
    const qs = serializePayoutsQuery({
      ...query,
      period,
      page: pagination.page,
    });
    redirect(`/settlements${qs ? `?${qs}` : ""}`);
  }

  const instructorMap = new Map(
    ((instructors.data as { id: string; name_kr: string | null }[] | null) ??
      []).map((i) => [i.id, i.name_kr]),
  );
  const projectMap = new Map(
    ((projects.data as { id: string; title: string }[] | null) ?? []).map(
      (p) => [p.id, p.title],
    ),
  );

  const periodLabel = formatPeriodLabel(period);

  return (
    <Container variant="default" className="flex flex-col gap-5 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[var(--color-primary)]" />
            정산 관리
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {periodLabel} 기준 · 총 {listResult.total}건
          </p>
        </div>
        <Button disabled title="후속 SPEC에서 일괄 처리 활성화">
          <Send /> 일괄 정산 요청
        </Button>
      </header>

      {/* 매입매출 위젯 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{periodLabel} 매입매출</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="사업비" value={formatKRW(aggregate.businessSum)} />
            <Stat label="강사비" value={formatKRW(aggregate.feeSum)} />
            <Stat
              label="수익"
              value={formatKRW(aggregate.profitSum)}
              accent
            />
            <Stat label="정산 건수" value={`${aggregate.count}건`} />
          </div>
          <p className="mt-3 text-sm md:text-xs text-[var(--color-text-muted)]">
            보류 상태와 삭제된 정산은 합계에서 제외됩니다.
          </p>
        </CardContent>
      </Card>

      {/* 필터 */}
      <PayoutFiltersBar
        currentStatus={query.status}
        currentFlow={query.flow}
        currentPeriod={period}
      />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>정산 내역</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {listResult.items.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-[var(--color-text-muted)] text-center py-8">
              표시할 정산 내역이 없어요. 필터를 변경하거나 다른 기간을 선택하세요.
            </p>
          ) : (
            <>
              {/* 모바일(<md) 카드 list — 프로젝트명/강사/흐름/금액/상태 */}
              <ul
                className="md:hidden grid grid-cols-1 gap-3 px-3 pb-3"
                role="list"
                aria-label="정산 내역"
              >
                {listResult.items.map((s) => {
                  const projectTitle = projectMap.get(s.project_id) ?? "—";
                  const instructorName = instructorMap.get(s.instructor_id) ?? "—";
                  return (
                    <li key={s.id}>
                      <Card className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/settlements/${s.id}`}
                              className="block font-medium truncate hover:underline"
                            >
                              {projectTitle}
                            </Link>
                            <p className="mt-1 text-sm text-[var(--color-text-muted)] truncate">
                              {instructorName}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge
                                variant={
                                  s.settlement_flow === "corporate"
                                    ? "info"
                                    : "proposed"
                                }
                              >
                                {SETTLEMENT_FLOW_LABEL[s.settlement_flow]}
                              </Badge>
                              <Badge variant={settlementStatusBadgeVariant(s.status)}>
                                {SETTLEMENT_STATUS_LABEL[s.status]}
                              </Badge>
                            </div>
                            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm md:text-xs">
                              <dt className="text-[var(--color-text-muted)]">강사비</dt>
                              <dd className="text-right font-tabular">
                                {formatKRW(s.instructor_fee_krw)}
                              </dd>
                              <dt className="text-[var(--color-text-muted)]">수익</dt>
                              <dd className="text-right font-tabular font-medium">
                                {formatKRW(s.profit_krw ?? 0)}
                              </dd>
                            </dl>
                          </div>
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="min-h-touch min-w-touch shrink-0"
                          >
                            <Link
                              href={`/settlements/${s.id}`}
                              aria-label={`${projectTitle} 정산 상세보기`}
                            >
                              <ChevronRight className="size-4" />
                            </Link>
                          </Button>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>

              {/* 데스크탑(>=md) 테이블 */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>프로젝트</TableHead>
                      <TableHead>강사</TableHead>
                      <TableHead>흐름</TableHead>
                      <TableHead className="text-right">사업비</TableHead>
                      <TableHead className="text-right">강사비</TableHead>
                      <TableHead className="text-right">수익</TableHead>
                      <TableHead className="text-right">원천세</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listResult.items.map((s) => {
                      const ratePercent = Number(s.withholding_tax_rate ?? 0);
                      return (
                        <TableRow
                          key={s.id}
                          className="cursor-pointer hover:bg-[var(--color-bg-muted)]"
                        >
                          <TableCell className="text-sm font-medium line-clamp-1">
                            <Link
                              href={`/settlements/${s.id}`}
                              className="hover:underline"
                            >
                              {projectMap.get(s.project_id) ?? "—"}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">
                            {instructorMap.get(s.instructor_id) ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                s.settlement_flow === "corporate"
                                  ? "info"
                                  : "proposed"
                              }
                            >
                              {SETTLEMENT_FLOW_LABEL[s.settlement_flow]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-tabular text-sm">
                            {formatKRW(s.business_amount_krw)}
                          </TableCell>
                          <TableCell className="text-right font-tabular text-sm">
                            {formatKRW(s.instructor_fee_krw)}
                          </TableCell>
                          <TableCell className="text-right font-tabular text-sm font-medium">
                            {formatKRW(s.profit_krw ?? 0)}
                          </TableCell>
                          <TableCell className="text-right font-tabular text-sm text-[var(--color-text-muted)]">
                            {ratePercent > 0 ? `${ratePercent.toFixed(2)}%` : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={settlementStatusBadgeVariant(s.status)}>
                              {SETTLEMENT_STATUS_LABEL[s.status]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 페이지네이션 */}
      {pagination.totalPages > 1 && (
        <nav
          aria-label="페이지네이션"
          className="flex items-center justify-center gap-2"
        >
          {Array.from({ length: pagination.totalPages }).map((_, i) => {
            const p = i + 1;
            const qs = serializePayoutsQuery({
              ...query,
              period,
              page: p,
            });
            const href = `/settlements${qs ? `?${qs}` : ""}`;
            const active = p === pagination.page;
            return (
              <Link
                key={p}
                href={href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-md bg-[var(--color-primary)] px-3 py-1 text-sm text-[var(--color-primary-foreground)]"
                    : "rounded-md border border-[var(--color-border)] px-3 py-1 text-sm hover:bg-[var(--color-bg-muted)]"
                }
              >
                {p}
              </Link>
            );
          })}
        </nav>
      )}
    </Container>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p
        className={
          accent
            ? "mt-1 text-lg font-bold font-tabular text-[var(--color-primary)]"
            : "mt-1 text-lg font-medium font-tabular"
        }
      >
        {value}
      </p>
    </div>
  );
}

function formatPeriodLabel(period: PayoutPeriod): string {
  if (period.kind === "month") {
    const [y, m] = period.raw.split("-");
    return `${y}년 ${Number(m)}월`;
  }
  if (period.kind === "quarter") {
    const [y, q] = period.raw.split("-Q");
    return `${y}년 ${q}분기`;
  }
  return `${period.raw}년`;
}

/**
 * 필터 바 — 단순 GET form. JS 비활성에서도 동작.
 * 강사 필터는 SPEC 범위 후속(데이터셋이 커질 때 instructor combobox로 확장).
 */
function PayoutFiltersBar({
  currentStatus,
  currentFlow,
  currentPeriod,
}: {
  currentStatus: string[];
  currentFlow: string | null;
  currentPeriod: PayoutPeriod;
}) {
  return (
    <form
      method="get"
      action="/settlements"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      aria-label="정산 필터"
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[var(--color-text-muted)]">기간</span>
        <input
          type="text"
          name="period"
          defaultValue={currentPeriod.raw}
          placeholder="2026-05 / 2026-Q2 / 2026"
          className="h-9 w-40 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[var(--color-text-muted)]">흐름</span>
        <select
          name="flow"
          defaultValue={currentFlow ?? ""}
          className="h-9 w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
        >
          <option value="">전체</option>
          <option value="corporate">기업</option>
          <option value="government">정부</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-[var(--color-text-muted)]">상태</span>
        <select
          name="status"
          multiple
          defaultValue={currentStatus}
          className="h-20 w-40 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm"
        >
          <option value="pending">정산 전</option>
          <option value="requested">정산 요청</option>
          <option value="paid">정산 완료</option>
          <option value="held">보류</option>
        </select>
      </label>
      <Button type="submit" size="sm">
        필터 적용
      </Button>
      <Button type="button" variant="outline" size="sm" asChild>
        <Link href="/settlements">초기화</Link>
      </Button>
    </form>
  );
}
