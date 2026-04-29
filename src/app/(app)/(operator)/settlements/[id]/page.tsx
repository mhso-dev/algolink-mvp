// SPEC-PAYOUT-001 §2.2 — 정산 상세 페이지 (RSC).

import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { requireRole } from "@/auth/guards";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatKRW } from "@/lib/utils";
import {
  getSettlement,
  listSettlementHistory,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_FLOW_LABEL,
  settlementStatusBadgeVariant,
  type SettlementStatus,
} from "@/lib/payouts";
import { SettlementActionsPanel } from "./actions-panel";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

const STATUS_FLOW: SettlementStatus[] = ["pending", "requested", "paid"];

function formatKstDateTime(iso: string | null): string {
  if (!iso) return "—";
  return `${new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))} KST`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SettlementDetailPage({ params }: PageProps) {
  await requireRole(["operator", "admin"]);
  const { id } = await params;
  const supabase = createClient(await cookies());

  const settlement = await getSettlement(supabase, id);
  if (!settlement) notFound();

  const [{ data: project }, { data: instructor }, history] = await Promise.all([
    supabase
      .from("projects")
      .select("title")
      .eq("id", settlement.project_id)
      .maybeSingle(),
    supabase
      .from("instructors_safe")
      .select("name_kr")
      .eq("id", settlement.instructor_id)
      .maybeSingle(),
    listSettlementHistory(supabase, id),
  ]);

  const projectTitle =
    (project as { title?: string } | null)?.title ?? "—";
  const instructorName =
    (instructor as { name_kr?: string | null } | null)?.name_kr ?? "—";

  const ratePercent = Number(settlement.withholding_tax_rate ?? 0);
  const status = settlement.status;

  return (
    <Container variant="narrow" className="flex flex-col gap-5 py-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/settlements">
            <ChevronLeft /> 목록으로
          </Link>
        </Button>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">정산 상세</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            프로젝트: <span className="font-medium text-[var(--color-text)]">{projectTitle}</span>
            <span className="mx-2">·</span>
            강사: <span className="font-medium text-[var(--color-text)]">{instructorName}</span>
          </p>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                settlement.settlement_flow === "corporate" ? "info" : "proposed"
              }
            >
              {SETTLEMENT_FLOW_LABEL[settlement.settlement_flow]}
            </Badge>
            <Badge variant={settlementStatusBadgeVariant(status)}>
              {SETTLEMENT_STATUS_LABEL[status]}
            </Badge>
          </div>
        </div>
      </header>

      {/* 4단계 stepper */}
      <Card>
        <CardHeader>
          <CardTitle>진행 상태</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex items-center gap-2" aria-label="정산 상태 단계">
            {STATUS_FLOW.map((s, idx) => {
              const isActive = status === s;
              return (
                <li key={s} className="flex items-center gap-2">
                  <span
                    aria-current={isActive ? "step" : undefined}
                    className={
                      isActive
                        ? "rounded-full bg-[var(--color-primary)] px-3 py-1 text-sm font-medium text-[var(--color-primary-foreground)]"
                        : "rounded-full bg-[var(--color-bg-muted)] px-3 py-1 text-sm text-[var(--color-text-muted)]"
                    }
                  >
                    {SETTLEMENT_STATUS_LABEL[s]}
                  </span>
                  {idx < STATUS_FLOW.length - 1 && (
                    <span aria-hidden="true" className="text-[var(--color-text-muted)]">
                      →
                    </span>
                  )}
                </li>
              );
            })}
            {status === "held" && (
              <li className="ml-4">
                <Badge variant="alert">보류</Badge>
              </li>
            )}
          </ol>
        </CardContent>
      </Card>

      {/* 금액 */}
      <Card>
        <CardHeader>
          <CardTitle>금액 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-3">
            <dt className="text-[var(--color-text-muted)]">사업비</dt>
            <dd className="md:col-span-2 font-tabular">
              {formatKRW(settlement.business_amount_krw)}
            </dd>
            <dt className="text-[var(--color-text-muted)]">강사비</dt>
            <dd className="md:col-span-2 font-tabular">
              {formatKRW(settlement.instructor_fee_krw)}
            </dd>
            <dt className="text-[var(--color-text-muted)]">수익</dt>
            <dd className="md:col-span-2 font-tabular font-medium">
              {formatKRW(settlement.profit_krw ?? 0)}
            </dd>
            <dt className="text-[var(--color-text-muted)]">원천세율</dt>
            <dd className="md:col-span-2">
              {ratePercent > 0 ? `${ratePercent.toFixed(2)}%` : "—"}
            </dd>
            <dt className="text-[var(--color-text-muted)]">원천세 금액</dt>
            <dd className="md:col-span-2 font-tabular">
              {formatKRW(settlement.withholding_tax_amount_krw ?? 0)}
            </dd>
            <dt className="text-[var(--color-text-muted)]">세금계산서</dt>
            <dd className="md:col-span-2">
              {settlement.tax_invoice_issued ? "발행" : "미발행"}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {/* 일자 */}
      <Card>
        <CardHeader>
          <CardTitle>일자 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-3">
            <dt className="text-[var(--color-text-muted)]">입금 확인일</dt>
            <dd className="md:col-span-2">
              {formatKstDateTime(settlement.payment_received_at)}
            </dd>
            <dt className="text-[var(--color-text-muted)]">송금일</dt>
            <dd className="md:col-span-2">
              {formatKstDateTime(settlement.payout_sent_at)}
            </dd>
            <dt className="text-[var(--color-text-muted)]">생성일</dt>
            <dd className="md:col-span-2">
              {formatKstDateTime(settlement.created_at)}
            </dd>
            <dt className="text-[var(--color-text-muted)]">수정일</dt>
            <dd className="md:col-span-2">
              {formatKstDateTime(settlement.updated_at)}
            </dd>
          </dl>
        </CardContent>
      </Card>

      {/* 메모 */}
      {settlement.notes && (
        <Card>
          <CardHeader>
            <CardTitle>메모</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{settlement.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* 상태 전환 */}
      <Card>
        <CardHeader>
          <CardTitle>상태 전환</CardTitle>
        </CardHeader>
        <CardContent>
          <SettlementActionsPanel
            settlementId={settlement.id}
            status={status}
            instructorName={instructorName}
          />
        </CardContent>
      </Card>

      {/* 이력 */}
      <Card>
        <CardHeader>
          <CardTitle>변경 이력</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              상태 변경 이력이 없습니다.
            </p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2 last:border-0"
                >
                  <span className="text-[var(--color-text-muted)] tabular-nums">
                    {formatKstDateTime(h.changed_at)}
                  </span>
                  <span>
                    {h.from_status
                      ? SETTLEMENT_STATUS_LABEL[h.from_status]
                      : "(생성)"}
                    <span className="mx-1 text-[var(--color-text-muted)]">→</span>
                    {SETTLEMENT_STATUS_LABEL[h.to_status]}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
