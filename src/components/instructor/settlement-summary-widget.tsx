// SPEC-ME-001 §2.6 REQ-ME-SET-004 — 정산 summary band (총합 + flow 분기). 서버 컴포넌트.

import { Card } from "@/components/ui/card";
import { formatKRW } from "@/lib/utils";
import type { SettlementSummary } from "@/lib/instructor/settlement-summary";
import type { FlowBreakdown } from "@/lib/instructor/settlement-grouping";

interface SettlementSummaryWidgetProps {
  total: SettlementSummary;
  byFlow: FlowBreakdown[];
}

const FLOW_LABEL: Record<string, string> = {
  government: "인건비",
  corporate: "세금계산서",
};

export function SettlementSummaryWidget({ total, byFlow }: SettlementSummaryWidgetProps) {
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="정산 요약">
      <SummaryCard label="총 강사료" value={Number(total.totalFeeKrw)} sub={`${total.count}건`} tone="primary" />
      <SummaryCard label="총 원천세" value={Number(total.totalWithholdingKrw)} sub={null} tone="muted" />
      <SummaryCard label="총 실수령" value={Number(total.totalNetKrw)} sub={null} tone="settled" />
      <SummaryCard label="미정산 (실수령)" value={Number(total.unsettledNetKrw)} sub="정산전+요청" tone="pending" />

      {byFlow.length > 0 && (
        <div className="col-span-2 lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {byFlow.map((b) => (
            <Card key={b.flow} className="p-4 border border-[var(--color-border)]">
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                {FLOW_LABEL[b.flow] ?? b.flow}
              </p>
              <p className="text-lg font-semibold font-tabular mt-1">
                {formatKRW(Number(b.summary.totalFeeKrw))}
                <span className="text-xs font-normal text-[var(--color-text-muted)] ml-2">
                  {b.summary.count}건
                </span>
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                실수령 {formatKRW(Number(b.summary.totalNetKrw))}
              </p>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string | null;
  tone: "pending" | "settled" | "primary" | "muted";
}) {
  const toneClass = {
    pending: "bg-[var(--color-state-pending-muted)] text-[var(--color-state-pending)]",
    settled: "bg-[var(--color-state-settled-muted)] text-[var(--color-state-settled)]",
    primary: "bg-[var(--color-primary-muted)] text-[var(--color-primary-muted-foreground)]",
    muted: "bg-[var(--color-surface-2)] text-[var(--color-text)]",
  }[tone];
  return (
    <Card className={`p-5 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-80">{label}</p>
      <p className="text-2xl font-bold font-tabular mt-1">{formatKRW(value, { sign: true })}</p>
      {sub && <p className="text-[11px] opacity-70 mt-0.5">{sub}</p>}
    </Card>
  );
}
