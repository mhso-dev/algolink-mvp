// SPEC-PROJECT-001 §2.1 — 프로젝트 리스트 (검색·필터·정렬·페이지네이션).

import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, ClipboardList } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatKRW } from "@/lib/utils";
import { STATUS_LABELS, statusBadgeVariant } from "@/lib/projects";
import {
  parseProjectListQuery,
  computePagination,
} from "@/lib/projects/list-query";
import { fetchProjectList } from "@/lib/projects/list-queries";
import { ProjectFiltersBar } from "@/components/projects/project-filters-bar";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProjectsListPage({ searchParams }: PageProps) {
  await requireUser();
  const sp = await searchParams;
  const query = parseProjectListQuery(sp);
  const supabase = createClient(await cookies());

  const [{ rows: projects, total }, instructorsRes, clientsRes, operatorsRes] =
    await Promise.all([
      fetchProjectList(supabase, query),
      supabase
        .from("instructors_safe")
        .select("id, name_kr")
        .returns<{ id: string; name_kr: string | null }[]>(),
      supabase
        .from("clients")
        .select("id, company_name")
        .returns<{ id: string; company_name: string | null }[]>(),
      supabase
        .from("users")
        .select("id, display_name, role")
        .in("role", ["operator", "admin"])
        .returns<{ id: string; display_name: string | null; role: string }[]>(),
    ]);

  const instructorMap = new Map(
    (instructorsRes.data ?? []).map((i) => [i.id, i.name_kr]),
  );
  const clientMap = new Map(
    (clientsRes.data ?? []).map((c) => [c.id, c.company_name]),
  );
  const operatorMap = new Map(
    (operatorsRes.data ?? []).map((o) => [o.id, o.display_name ?? o.id.slice(0, 8)]),
  );

  const pagination = computePagination(total, query.page, query.pageSize);
  if (pagination.needsRedirect) {
    // REQ-PROJECT-LIST-007 — page 초과 → 마지막 유효 페이지
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string") params.set(k, v);
    }
    params.set("page", String(pagination.totalPages));
    redirect(`/projects?${params.toString()}`);
  }

  const clientOptions = (clientsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.company_name ?? "(이름 없음)",
  }));
  const operatorOptions = (operatorsRes.data ?? []).map((o) => ({
    id: o.id,
    name: o.display_name ?? o.id.slice(0, 8),
  }));

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
            <Plus /> 신규 의뢰
          </Link>
        </Button>
      </header>

      <Card className="p-3">
        <ProjectFiltersBar
          query={query}
          clients={clientOptions}
          operators={operatorOptions}
        />
      </Card>

      <Card className="overflow-hidden">
        {projects.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium mb-2">조건에 맞는 프로젝트가 없습니다</p>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              필터를 변경하거나 새 일정을 추가해 보세요.
            </p>
            <Button asChild>
              <Link href="/projects/new">
                <Plus /> 일정 추가
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              교육 프로젝트 목록 - 총 {total}건 중 {pagination.rangeStart + 1}-
              {pagination.rangeEnd}건 표시 (페이지 {pagination.page}/{pagination.totalPages})
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="w-32">교육 시작일</TableHead>
                <TableHead scope="col">고객사</TableHead>
                <TableHead scope="col">사업명·과정명</TableHead>
                <TableHead scope="col">담당자</TableHead>
                <TableHead scope="col">강사</TableHead>
                <TableHead scope="col" className="text-right">사업비</TableHead>
                <TableHead scope="col" className="text-right">강사비</TableHead>
                <TableHead scope="col">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell className="font-tabular text-xs whitespace-nowrap">
                    {p.education_start_at
                      ? format(new Date(p.education_start_at), "yyyy.MM.dd", { locale: ko })
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
                    {p.operator_id ? operatorMap.get(p.operator_id) ?? "—" : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.instructor_id
                      ? instructorMap.get(p.instructor_id) ?? "—"
                      : "미배정"}
                  </TableCell>
                  <TableCell className="text-right font-tabular text-sm">
                    {formatKRW(p.business_amount_krw)}
                  </TableCell>
                  <TableCell className="text-right font-tabular text-sm">
                    {formatKRW(p.instructor_fee_krw)}
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

      {pagination.totalPages > 1 && (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={total}
          searchParamsObj={sp}
        />
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  searchParamsObj,
}: {
  page: number;
  totalPages: number;
  total: number;
  searchParamsObj: Record<string, string | string[] | undefined>;
}) {
  const buildHref = (target: number): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParamsObj)) {
      if (k === "page") continue;
      if (typeof v === "string") params.set(k, v);
      else if (Array.isArray(v)) params.set(k, v.join(","));
    }
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/projects?${qs}` : "/projects";
  };

  const windowSize = 5;
  const half = Math.floor(windowSize / 2);
  let start = Math.max(1, page - half);
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <nav
      aria-label="페이지 네비게이션"
      className="flex items-center justify-between gap-3"
    >
      <p className="text-xs text-[var(--color-text-muted)]">
        총 {total.toLocaleString()}건 중 페이지 {page}/{totalPages}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          <Button asChild variant="outline" size="sm" disabled={page === 1}>
            <Link href={buildHref(Math.max(1, page - 1))} aria-label="이전 페이지">
              이전
            </Link>
          </Button>
        </li>
        {pages.map((p) => (
          <li key={p}>
            <Button
              asChild
              variant={p === page ? "default" : "outline"}
              size="sm"
              aria-current={p === page ? "page" : undefined}
            >
              <Link href={buildHref(p)} aria-label={`페이지 ${p}`}>
                {p}
              </Link>
            </Button>
          </li>
        ))}
        <li>
          <Button asChild variant="outline" size="sm" disabled={page === totalPages}>
            <Link
              href={buildHref(Math.min(totalPages, page + 1))}
              aria-label="다음 페이지"
            >
              다음
            </Link>
          </Button>
        </li>
      </ul>
    </nav>
  );
}
