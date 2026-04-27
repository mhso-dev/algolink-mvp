import { cookies } from "next/headers";
import { Receipt } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { requireUser } from "@/lib/auth";
import { formatKRW, maskMiddle } from "@/lib/utils";
import {
  SETTLEMENT_FLOW_LABEL,
  SETTLEMENT_STATUS_LABEL,
  settlementStatusBadgeVariant,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

type SettlementRow = {
  id: string;
  project_id: string;
  status: string;
  settlement_flow: string;
  business_amount_krw: number;
  instructor_fee_krw: number;
  withholding_tax_rate: string;
  withholding_tax_amount_krw: number;
  payment_received_at: string | null;
  payout_sent_at: string | null;
};

export default async function MySettlementsPage() {
  const session = await requireUser();
  const supabase = createClient(await cookies());

  const { data, error } = await supabase
    .from("settlements")
    .select(
      "id, project_id, status, settlement_flow, business_amount_krw, instructor_fee_krw, withholding_tax_rate, withholding_tax_amount_krw, payment_received_at, payout_sent_at",
    )
    .order("created_at", { ascending: false })
    .returns<SettlementRow[]>();

  const settlements = data ?? [];
  const pending = settlements.filter((s) => s.status === "pending" || s.status === "requested");
  const paid = settlements.filter((s) => s.status === "paid");

  const pendingTotal = pending.reduce(
    (sum, s) => sum + s.instructor_fee_krw - (s.withholding_tax_amount_krw ?? 0),
    0,
  );
  const paidTotal = paid.reduce(
    (sum, s) => sum + s.instructor_fee_krw - (s.withholding_tax_amount_krw ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="h-6 w-6 text-[var(--color-primary)]" />
          내 정산
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {session.displayName}님의 강사료 정산 내역. 실수령액은 원천세 차감 기준입니다.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="미정산 (실수령)" value={pendingTotal} tone="pending" />
        <SummaryCard label="누적 지급" value={paidTotal} tone="settled" />
        <SummaryCard
          label="진행 건수"
          value={settlements.length}
          tone="primary"
          isCount
        />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>정산 상세</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {error ? (
            <p className="px-6 pb-6 text-sm text-[var(--color-state-alert)]">
              데이터 조회 오류: {error.message}
            </p>
          ) : settlements.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-[var(--color-text-muted)] text-center py-8">
              아직 정산 내역이 없어요.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>구분</TableHead>
                  <TableHead className="text-right">강사비</TableHead>
                  <TableHead className="text-right">원천세</TableHead>
                  <TableHead className="text-right">실수령</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm">
                      {SETTLEMENT_FLOW_LABEL[s.settlement_flow]}
                    </TableCell>
                    <TableCell className="text-right font-tabular">
                      {formatKRW(s.instructor_fee_krw)}
                    </TableCell>
                    <TableCell className="text-right font-tabular text-[var(--color-text-muted)]">
                      {s.withholding_tax_amount_krw > 0
                        ? `-${formatKRW(s.withholding_tax_amount_krw)} (${s.withholding_tax_rate}%)`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-tabular font-semibold">
                      {formatKRW(s.instructor_fee_krw - s.withholding_tax_amount_krw)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={settlementStatusBadgeVariant(s.status)}>
                        {SETTLEMENT_STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>지급 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            인건비 처리(3.3% / 8.8%) 또는 세금계산서 처리에 따라 필요한 정보가 다릅니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border border-[var(--color-border)] p-3">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">통장사본</p>
              <p className="text-sm font-tabular mt-1">{maskMiddle("110-123-456789", 3, 4)}</p>
              <Button variant="ghost" size="sm" className="mt-2 -ml-2">
                수정
              </Button>
            </div>
            <div className="rounded-md border border-[var(--color-border)] p-3">
              <p className="text-xs font-medium text-[var(--color-text-muted)]">주민등록번호</p>
              <p className="text-sm font-tabular mt-1">미등록</p>
              <Button variant="ghost" size="sm" className="mt-2 -ml-2">
                등록
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  isCount = false,
}: {
  label: string;
  value: number;
  tone: "pending" | "settled" | "primary";
  isCount?: boolean;
}) {
  const toneClass = {
    pending: "bg-[var(--color-state-pending-muted)] text-[var(--color-state-pending)]",
    settled: "bg-[var(--color-state-settled-muted)] text-[var(--color-state-settled)]",
    primary: "bg-[var(--color-primary-muted)] text-[var(--color-primary-muted-foreground)]",
  }[tone];

  return (
    <Card className={`p-5 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-2xl font-bold font-tabular mt-1">
        {isCount ? `${value}건` : formatKRW(value, { sign: true })}
      </p>
    </Card>
  );
}
