// SPEC-ME-001 §2.6 REQ-ME-SET-002 — 정산 상세 테이블 (월별 그룹). 서버 컴포넌트.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  SETTLEMENT_FLOW_LABEL,
  SETTLEMENT_STATUS_LABEL,
  settlementStatusBadgeVariant,
} from "@/lib/projects";
import type { MonthlyGroup } from "@/lib/instructor/settlement-grouping";

interface SettlementListProps {
  groups: MonthlyGroup[];
}

const KST_DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

function formatKstDate(iso: string | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return KST_DATE_FMT.format(new Date(ts));
}

function flowLabel(flow: string, withholdingRate: number): string {
  if (flow === "corporate") return "세금계산서 (원천 0%)";
  if (flow === "government") return `인건비 (${withholdingRate.toFixed(2)}%)`;
  return SETTLEMENT_FLOW_LABEL[flow] ?? flow;
}

export function SettlementList({ groups }: SettlementListProps) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>정산 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">
            아직 정산 내역이 없어요.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.monthKey ?? "no-period"} className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>{g.label}</CardTitle>
            <div className="text-xs text-[var(--color-text-muted)] flex flex-wrap gap-x-3">
              <span>총 {g.summary.count}건</span>
              <span>강사료 {formatKRW(Number(g.summary.totalFeeKrw))}</span>
              <span>실수령 {formatKRW(Number(g.summary.totalNetKrw))}</span>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>프로젝트</TableHead>
                  <TableHead>고객사</TableHead>
                  <TableHead>강의 기간</TableHead>
                  <TableHead>정산 방식</TableHead>
                  <TableHead className="text-right">강사료</TableHead>
                  <TableHead className="text-right">원천세</TableHead>
                  <TableHead className="text-right">실수령</TableHead>
                  <TableHead>지급일</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.records.map((r) => {
                  const fee = Number(r.instructorFeeKrw);
                  const wh = Number(r.withholdingTaxAmountKrw);
                  const net = fee - wh;
                  const rate =
                    typeof r.withholdingTaxRate === "number"
                      ? r.withholdingTaxRate
                      : Number.parseFloat(String(r.withholdingTaxRate));
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm font-medium">{r.projectTitle}</TableCell>
                      <TableCell className="text-sm text-[var(--color-text-muted)]">
                        {r.clientName ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.educationStartAt ? formatKstDate(r.educationStartAt) : "—"}
                        {r.educationEndAt && r.educationStartAt !== r.educationEndAt
                          ? ` ~ ${formatKstDate(r.educationEndAt)}`
                          : ""}
                      </TableCell>
                      <TableCell className="text-xs">{flowLabel(r.settlementFlow, rate)}</TableCell>
                      <TableCell className="text-right font-tabular">{formatKRW(fee)}</TableCell>
                      <TableCell className="text-right font-tabular text-[var(--color-text-muted)]">
                        {wh > 0 ? `-${formatKRW(wh)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right font-tabular font-semibold">
                        {formatKRW(net)}
                      </TableCell>
                      <TableCell className="text-xs">{formatKstDate(r.payoutSentAt)}</TableCell>
                      <TableCell>
                        <Badge variant={settlementStatusBadgeVariant(r.status)}>
                          {SETTLEMENT_STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
