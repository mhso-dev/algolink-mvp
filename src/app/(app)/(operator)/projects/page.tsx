import { cookies } from "next/headers";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, Search, Filter, ArrowUpDown, ClipboardList } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { STATUS_LABELS, statusBadgeVariant, type ProjectStatus } from "@/lib/projects";

export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  title: string;
  status: ProjectStatus;
  scheduled_at: string | null;
  education_start_at: string | null;
  education_end_at: string | null;
  business_amount_krw: number;
  instructor_fee_krw: number;
  margin_krw: number | null;
  client_id: string;
  instructor_id: string | null;
};

export default async function ProjectsListPage() {
  await requireUser();
  const supabase = createClient(await cookies());

  const [projectsRes, instructorsRes, clientsRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, status, scheduled_at, education_start_at, education_end_at, business_amount_krw, instructor_fee_krw, margin_krw, client_id, instructor_id",
      )
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .returns<ProjectRow[]>(),
    supabase
      .from("instructors_safe")
      .select("id, name_kr")
      .returns<{ id: string; name_kr: string | null }[]>(),
    supabase
      .from("clients")
      .select("id, company_name")
      .returns<{ id: string; company_name: string | null }[]>(),
  ]);

  const projects = projectsRes.data ?? [];
  const instructorMap = new Map((instructorsRes.data ?? []).map((i) => [i.id, i.name_kr]));
  const clientMap = new Map((clientsRes.data ?? []).map((c) => [c.id, c.company_name]));

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-[var(--color-primary)]" />
            교육 프로젝트
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            의뢰부터 정산까지 전체 프로젝트를 한 화면에서 관리하세요.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus /> 일정 추가
          </Link>
        </Button>
      </header>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]" />
            <Input placeholder="사업명·과정명·강사 검색" className="pl-8" />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-3.5 w-3.5" /> 필터
          </Button>
          <Button variant="outline" size="sm">
            <ArrowUpDown className="h-3.5 w-3.5" /> 정렬
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {projects.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium mb-2">아직 등록된 프로젝트가 없어요</p>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              새 일정을 추가해 시작해 보세요.
            </p>
            <Button asChild>
              <Link href="/projects/new">
                <Plus /> 일정 추가
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">일정</TableHead>
                <TableHead>고객사</TableHead>
                <TableHead>사업명·과정명</TableHead>
                <TableHead>강사</TableHead>
                <TableHead className="text-right">사업비</TableHead>
                <TableHead className="text-right">강사비</TableHead>
                <TableHead className="text-right">마진</TableHead>
                <TableHead>진행단계</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell className="font-tabular text-xs whitespace-nowrap">
                    {p.education_start_at
                      ? format(new Date(p.education_start_at), "yyyy.MM.dd", { locale: ko })
                      : p.scheduled_at
                        ? format(new Date(p.scheduled_at), "yyyy.MM.dd", { locale: ko })
                        : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {clientMap.get(p.client_id) ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    <Link href={`/projects/${p.id}`} className="hover:underline">
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.instructor_id ? instructorMap.get(p.instructor_id) ?? "—" : "미배정"}
                  </TableCell>
                  <TableCell className="text-right font-tabular text-sm">
                    {formatKRW(p.business_amount_krw)}
                  </TableCell>
                  <TableCell className="text-right font-tabular text-sm">
                    {formatKRW(p.instructor_fee_krw)}
                  </TableCell>
                  <TableCell className="text-right font-tabular text-sm font-medium">
                    {formatKRW(p.margin_krw ?? p.business_amount_krw - p.instructor_fee_krw)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(p.status)}>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* 정산 내역 흐름 참고표 */}
      <Card>
        <div className="border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="text-sm font-semibold">정산 내역 흐름 참고</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            기업교육 / 정부교육에 따라 지급 흐름과 원천세율이 분기됩니다.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>구분</TableHead>
              <TableHead>지급 흐름</TableHead>
              <TableHead className="text-right">사업비</TableHead>
              <TableHead className="text-right">강사비</TableHead>
              <TableHead className="text-right">예상 수익</TableHead>
              <TableHead>원천세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <Badge variant="info">기업교육</Badge>
              </TableCell>
              <TableCell className="text-sm">고객 → 알고링크 → 강사</TableCell>
              <TableCell className="text-right font-tabular">100,000</TableCell>
              <TableCell className="text-right font-tabular">80,000</TableCell>
              <TableCell className="text-right font-tabular">20,000</TableCell>
              <TableCell className="text-sm text-[var(--color-text-muted)]">없음</TableCell>
            </TableRow>
            <TableRow>
              <TableCell rowSpan={2}>
                <Badge variant="proposed">정부교육</Badge>
              </TableCell>
              <TableCell rowSpan={2} className="text-sm">
                고객 → 강사 → 알고링크
              </TableCell>
              <TableCell className="text-right font-tabular">100,000</TableCell>
              <TableCell className="text-right font-tabular">80,000</TableCell>
              <TableCell className="text-right font-tabular">18,240</TableCell>
              <TableCell className="text-sm">8.80%</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-right font-tabular">100,000</TableCell>
              <TableCell className="text-right font-tabular">80,000</TableCell>
              <TableCell className="text-right font-tabular">19,340</TableCell>
              <TableCell className="text-sm">3.30%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
