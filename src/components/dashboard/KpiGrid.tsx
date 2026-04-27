// @MX:NOTE: SPEC-DASHBOARD-001 §M3 — KPI 4 카드 grid (REQ-DASH-KPI-001).
import { KpiCard } from "./KpiCard";
import { formatKrw } from "@/lib/dashboard/format";
import type { KpiSummary } from "@/lib/dashboard/types";

interface KpiGridProps {
  summary: KpiSummary | null;
}

export function KpiGrid({ summary }: KpiGridProps) {
  // null = 데이터 로드 실패 → 모든 값 '—' 표시.
  const s = summary;
  return (
    <section aria-label="대시보드 KPI 요약">
      <p className="sr-only">
        총 4종 KPI: 의뢰 건수 {s?.requestCount ?? "—"}, 배정확정{" "}
        {s?.confirmedCount ?? "—"}, 교육중 {s?.inProgressCount ?? "—"}, 미정산 합계{" "}
        {s ? formatKrw(s.unsettledTotal) : "—"}.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="의뢰 건수"
          value={s?.requestCount ?? null}
          unit="건"
          description="신규 의뢰 / 사업제안 / 강의요청"
          href="/projects?status=의뢰"
        />
        <KpiCard
          label="배정확정 건수"
          value={s?.confirmedCount ?? null}
          unit="건"
          description="배정 / 교육 확정 단계"
          href="/projects?status=컨펌"
        />
        <KpiCard
          label="교육중 건수"
          value={s?.inProgressCount ?? null}
          unit="건"
          description="진행확정 / 진행중"
          href="/projects?status=진행"
        />
        <KpiCard
          label="미정산 합계"
          formattedValue={s ? formatKrw(s.unsettledTotal) : "—"}
          description="정산 미완료 사업액 합계"
        />
      </div>
    </section>
  );
}
