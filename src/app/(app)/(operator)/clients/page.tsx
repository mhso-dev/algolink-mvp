// SPEC-CLIENT-001 §2.2 — 고객사 리스트 (회사명 ILIKE 검색 + 페이지네이션 + soft-delete 제외).

import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Plus, Search } from "lucide-react";
import { createClient as createSupabaseClient } from "@/utils/supabase/server";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  parseClientsQuery,
  buildPageMeta,
} from "@/lib/clients/list-query";
import { listClients } from "@/lib/clients/queries";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ClientsPage({ searchParams }: PageProps) {
  await requireUser();
  const sp = await searchParams;
  const query = parseClientsQuery(sp);
  const supabase = createSupabaseClient(await cookies());

  const { rows, total } = await listClients(supabase, query);
  const meta = buildPageMeta(total, query.page, query.pageSize);

  if (meta.needsRedirect) {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (meta.totalPages > 1) params.set("page", String(meta.totalPages));
    const qs = params.toString();
    redirect(qs ? `/clients?${qs}` : "/clients");
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[var(--color-primary)]" />
            고객사 관리
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            등록된 고객사 — 사업자등록증·담당자 정보·인수인계 메모를 보관합니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/clients/new">
            <Plus /> 고객사 등록
          </Link>
        </Button>
      </header>

      <Card className="p-3">
        <form action="/clients" method="get" className="flex items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]" />
            <Input
              name="q"
              defaultValue={query.q ?? ""}
              placeholder="고객사명 검색"
              className="pl-8"
              aria-label="고객사명 검색"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            검색
          </Button>
          {query.q ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/clients">초기화</Link>
            </Button>
          ) : null}
        </form>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium mb-2">
              {query.q ? "검색 결과가 없습니다" : "아직 등록된 고객사가 없어요"}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              {query.q
                ? "검색어를 변경하거나 신규 고객사를 등록해 보세요."
                : "신규 고객사를 등록해 시작하세요."}
            </p>
            <Button asChild>
              <Link href="/clients/new">
                <Plus /> 고객사 등록
              </Link>
            </Button>
          </div>
        ) : (
          <Table>
            <TableCaption className="sr-only">
              고객사 목록 — 총 {total}건 중 {meta.rangeStart}-{meta.rangeEnd}건 표시 (페이지{" "}
              {meta.page}/{meta.totalPages})
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">회사명</TableHead>
                <TableHead scope="col">주소</TableHead>
                <TableHead scope="col">사업자등록증</TableHead>
                <TableHead scope="col">등록일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/clients/${c.id}`} className="hover:underline">
                      {c.company_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-[var(--color-text-muted)] line-clamp-1">
                    {c.address ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {c.business_license_file_id ? "첨부됨" : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-[var(--color-text-muted)]">
                    {formatKstDate(c.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {rows.length > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--color-text-muted)]">
            총 {total.toLocaleString()}건 중 {meta.rangeStart}-{meta.rangeEnd} 표시 (페이지{" "}
            {meta.page}/{meta.totalPages})
          </p>
          {meta.totalPages > 1 ? (
            <PaginationLinks q={query.q} page={meta.page} totalPages={meta.totalPages} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatKstDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function PaginationLinks({
  q,
  page,
  totalPages,
}: {
  q: string | null;
  page: number;
  totalPages: number;
}) {
  const buildHref = (target: number): string => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/clients?${qs}` : "/clients";
  };

  return (
    <nav aria-label="페이지 네비게이션" className="flex items-center gap-1">
      <Button asChild variant="outline" size="sm" disabled={page === 1}>
        <Link href={buildHref(Math.max(1, page - 1))} aria-label="이전 페이지">
          이전
        </Link>
      </Button>
      <span className="text-xs text-[var(--color-text-muted)] px-2">
        {page} / {totalPages}
      </span>
      <Button asChild variant="outline" size="sm" disabled={page === totalPages}>
        <Link
          href={buildHref(Math.min(totalPages, page + 1))}
          aria-label="다음 페이지"
        >
          다음
        </Link>
      </Button>
    </nav>
  );
}
