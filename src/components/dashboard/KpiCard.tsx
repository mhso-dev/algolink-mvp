// @MX:NOTE: SPEC-DASHBOARD-001 §M3 — 단일 KPI 카드. href 유무에 따라 a/div.
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  value?: string | number | null;
  description?: string;
  href?: string;
  /** value 옆에 단위(원, 건 등). value가 number일 때만 적용. */
  unit?: string;
  /** value 가공: 이미 string 으로 포맷된 값 우선 */
  formattedValue?: string;
}

function renderValue(props: KpiCardProps): { display: string; full: string } {
  if (props.formattedValue !== undefined && props.formattedValue !== null) {
    return { display: props.formattedValue, full: props.formattedValue };
  }
  if (props.value === null || props.value === undefined) {
    // REQ-DASH-KPI-006: 데이터 unavailable → em dash.
    return { display: "—", full: "데이터 없음" };
  }
  if (typeof props.value === "number") {
    const withUnit = `${props.value.toLocaleString("ko-KR")}${props.unit ?? ""}`;
    return { display: withUnit, full: withUnit };
  }
  return { display: props.value, full: props.value };
}

export function KpiCard(props: KpiCardProps) {
  const { display, full } = renderValue(props);
  const ariaLabel = `${props.label} ${full}`;
  const inner = (
    <Card
      className={cn(
        "flex flex-col gap-1 p-5 transition-shadow",
        props.href && "hover:shadow-md",
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {props.label}
      </span>
      <span className="text-2xl font-bold leading-tight font-tabular text-[var(--color-text)]">
        {display}
      </span>
      {props.description && (
        <span className="text-xs text-[var(--color-text-muted)]">{props.description}</span>
      )}
    </Card>
  );

  if (props.href) {
    return (
      <Link
        href={props.href}
        aria-label={ariaLabel}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] rounded-md"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div role="group" aria-label={ariaLabel}>
      {inner}
    </div>
  );
}
