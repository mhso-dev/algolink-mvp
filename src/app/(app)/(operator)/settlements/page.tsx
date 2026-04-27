import { cookies } from "next/headers";
import { Receipt, Send } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatKRW } from "@/lib/utils";
import {
  SETTLEMENT_STATUS_LABEL,
  settlementStatusBadgeVariant,
} from "@/lib/projects";

export const dynamic = "force-dynamic";

type SettlementRow = {
  id: string;
  project_id: string;
  instructor_id: string;
  status: string;
  settlement_flow: string;
  business_amount_krw: number;
  instructor_fee_krw: number;
  withholding_tax_rate: string;
  withholding_tax_amount_krw: number;
  profit_krw: number;
};

export default async function SettlementsManagementPage() {
  await requireUser();
  const supabase = createClient(await cookies());

  const [settlementsRes, instructorsRes, projectsRes] = await Promise.all([
    supabase
      .from("settlements")
      .select(
        "id, project_id, instructor_id, status, settlement_flow, business_amount_krw, instructor_fee_krw, withholding_tax_rate, withholding_tax_amount_krw, profit_krw",
      )
      .order("created_at", { ascending: false })
      .returns<SettlementRow[]>(),
    supabase
      .from("instructors_safe")
      .select("id, name_kr")
      .returns<{ id: string; name_kr: string | null }[]>(),
    supabase
      .from("projects")
      .select("id, title")
      .returns<{ id: string; title: string }[]>(),
  ]);

  const settlements = settlementsRes.data ?? [];
  const instructorMap = new Map((instructorsRes.data ?? []).map((i) => [i.id, i.name_kr]));
  const projectMap = new Map((projectsRes.data ?? []).map((p) => [p.id, p.title]));

  const pendingCount = settlements.filter((s) => s.status === "pending").length;
  const totalProfit = settlements.reduce((sum, s) => sum + (s.profit_krw ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[var(--color-primary)]" />
            정산 관리
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            정산 전 {pendingCount}건 · 누적 수익 {formatKRW(totalProfit, { sign: true })}
          </p>
        </div>
        <Button disabled>
          <Send /> 일괄 정산 요청
        </Button>
      </header>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>정산 내역</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {settlements.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-[var(--color-text-muted)] text-center py-8">
              아직 정산 내역이 없어요. 교육이 종료되면 자동으로 정산 행이 생성됩니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox aria-label="전체 선택" />
                  </TableHead>
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
                {settlements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Checkbox aria-label={`${s.id} 선택`} />
                    </TableCell>
                    <TableCell className="text-sm font-medium line-clamp-1">
                      {projectMap.get(s.project_id) ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {instructorMap.get(s.instructor_id) ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.settlement_flow === "corporate" ? "info" : "proposed"}>
                        {s.settlement_flow === "corporate" ? "기업" : "정부"}
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
                      {Number(s.withholding_tax_rate) > 0 ? `${s.withholding_tax_rate}%` : "—"}
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
    </div>
  );
}
