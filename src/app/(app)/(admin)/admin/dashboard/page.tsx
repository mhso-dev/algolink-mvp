// SPEC-ADMIN-001 §3.3 F-302 — 매출/매입/마진 KPI + 추이 + Top-N.
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/auth/guards";
import {
  isPeriodKind,
  toRange,
  type PeriodKind,
} from "@/lib/admin/aggregations/period";
import { sumRevenue } from "@/lib/admin/aggregations/revenue";
import { sumCost } from "@/lib/admin/aggregations/cost";
import { sumMargin } from "@/lib/admin/aggregations/margin";
import { getMonthlyTrend } from "@/lib/admin/aggregations/by-month";
import { getTopClients } from "@/lib/admin/aggregations/by-client";
import { getTopInstructors } from "@/lib/admin/aggregations/by-instructor";
import { Container } from "@/components/app/container";

export const dynamic = "force-dynamic";

const PERIOD_LABEL: Record<PeriodKind, string> = {
  month: "월",
  quarter: "분기",
  year: "연도",
};

function formatKrw(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const periodRaw = sp.period;
  const periodValue = Array.isArray(periodRaw) ? periodRaw[0] : periodRaw;
  const kind: PeriodKind = isPeriodKind(periodValue) ? periodValue : "month";
  const range = toRange({ kind, anchor: new Date() });

  const [revenue, cost, margin, trend, topClients, topInstructors] = await Promise.all([
    sumRevenue(range),
    sumCost(range),
    sumMargin(range),
    getMonthlyTrend(6),
    getTopClients(5, range),
    getTopInstructors(5, range),
  ]);

  return (
    <Container variant="narrow" className="flex flex-col gap-5 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">매출 / 매입 집계</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            관리자 전용 대시보드 · 기간: {PERIOD_LABEL[kind]}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          {(Object.keys(PERIOD_LABEL) as PeriodKind[]).map((k) => (
            <Link
              key={k}
              href={`/admin/dashboard?period=${k}`}
              className={`border rounded px-3 py-1 ${
                kind === k
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-text)]"
              }`}
            >
              {PERIOD_LABEL[k]}
            </Link>
          ))}
        </nav>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-[var(--color-text-muted)]">매출</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" aria-label={`매출 ${formatKrw(revenue)}`}>
              {formatKrw(revenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-[var(--color-text-muted)]">매입</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" aria-label={`매입 ${formatKrw(cost)}`}>
              {formatKrw(cost)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-[var(--color-text-muted)]">마진</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" aria-label={`마진 ${formatKrw(margin)}`}>
              {formatKrw(margin)}
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>최근 6개월 추이</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">데이터 없음</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--color-text-muted)]">
                    <th className="text-left py-1">월</th>
                    <th className="text-right py-1">매출</th>
                    <th className="text-right py-1">매입</th>
                    <th className="text-right py-1">마진</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((row) => (
                    <tr key={row.month} className="border-t">
                      <td className="py-1">{row.month.slice(0, 7)}</td>
                      <td className="text-right py-1">{formatKrw(row.revenue)}</td>
                      <td className="text-right py-1">{formatKrw(row.cost)}</td>
                      <td className="text-right py-1">{formatKrw(row.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>고객사 Top 5 (매출)</CardTitle>
          </CardHeader>
          <CardContent>
            {topClients.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">데이터 없음</p>
            ) : (
              <ol className="text-sm flex flex-col gap-1">
                {topClients.map((c, i) => (
                  <li key={c.clientId} className="flex justify-between border-b py-1">
                    <span>
                      {i + 1}. {c.companyName}
                    </span>
                    <span className="font-mono">{formatKrw(c.revenue)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>강사 Top 5 (마진)</CardTitle>
          </CardHeader>
          <CardContent>
            {topInstructors.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">데이터 없음</p>
            ) : (
              <ol className="text-sm flex flex-col gap-1">
                {topInstructors.map((u, i) => (
                  <li key={u.instructorId} className="flex justify-between border-b py-1">
                    <span>
                      {i + 1}. {u.nameKr}
                    </span>
                    <span className="font-mono">{formatKrw(u.profit)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </section>
    </Container>
  );
}
