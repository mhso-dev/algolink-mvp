// SPEC-PROPOSAL-001 §M3 REQ-PROPOSAL-LIST-* — 제안서 리스트 페이지 (RSC).
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
  buildProposalPageMeta,
  parseProposalsQuery,
} from "@/lib/proposals/list-query";
import { listProposals } from "@/lib/proposals/queries";
import {
  PROPOSAL_STATUS_BADGE_VARIANT,
  PROPOSAL_STATUS_LABELS,
} from "@/lib/proposals/labels";
import { ProposalFiltersBar } from "@/components/proposals/ProposalFiltersBar";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProposalsListPage({ searchParams }: PageProps) {
  await requireUser();
  const sp = await searchParams;
  const query = parseProposalsQuery(sp);
  const supabase = createClient(await cookies());

  const [{ rows, total }, clientsRes] = await Promise.all([
    listProposals(supabase, query),
    supabase
      .from("clients")
      .select("id, company_name")
      .is("deleted_at", null)
      .order("company_name"),
  ]);

  const meta = buildProposalPageMeta(total, query.page);
  if (meta.needsRedirect) {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.statuses.length > 0)
      params.set("status", query.statuses.join(","));
    if (query.clientId) params.set("client_id", query.clientId);
    if (query.periodFrom) params.set("period_from", query.periodFrom);
    if (query.periodTo) params.set("period_to", query.periodTo);
    params.set("page", String(meta.page));
    redirect(`/proposals?${params.toString()}`);
  }

  const clients = (clientsRes.data ?? []) as Array<{
    id: string;
    company_name: string;
  }>;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/operator" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4 mr-1" />
            대시보드
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mt-2">제안서</h1>
          <p className="text-muted-foreground">고객사 제안서 관리</p>
        </div>
        <Link href="/proposals/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            신규 제안서
          </Button>
        </Link>
      </div>

      <ProposalFiltersBar query={query} clients={clients} />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>고객사</TableHead>
              <TableHead>담당자</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>기간</TableHead>
              <TableHead className="text-right">사업비</TableHead>
              <TableHead>등록일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  등록된 제안서가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/proposals/${row.id}`} className="hover:underline">
                      {row.title}
                    </Link>
                  </TableCell>
                  <TableCell>{row.client_name ?? "-"}</TableCell>
                  <TableCell>{row.operator_name ?? "-"}</TableCell>
                  <TableCell>
                    <Badge variant={PROPOSAL_STATUS_BADGE_VARIANT[row.status]}>
                      {PROPOSAL_STATUS_LABELS[row.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.proposed_period_start && row.proposed_period_end
                      ? `${row.proposed_period_start} ~ ${row.proposed_period_end}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.proposed_business_amount_krw != null
                      ? formatKRW(row.proposed_business_amount_krw)
                      : "-"}
                  </TableCell>
                  <TableCell>{format(new Date(row.created_at), "yyyy-MM-dd")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div>
            {meta.rangeStart}-{meta.rangeEnd} / 총 {meta.total}건
          </div>
          <div className="flex gap-2">
            <Pagination
              query={query}
              currentPage={meta.page}
              totalPages={meta.totalPages}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Pagination({
  query,
  currentPage,
  totalPages,
}: {
  query: ReturnType<typeof parseProposalsQuery>;
  currentPage: number;
  totalPages: number;
}) {
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.statuses.length > 0)
      params.set("status", query.statuses.join(","));
    if (query.clientId) params.set("client_id", query.clientId);
    if (query.periodFrom) params.set("period_from", query.periodFrom);
    if (query.periodTo) params.set("period_to", query.periodTo);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/proposals?${qs}` : "/proposals";
  };
  return (
    <>
      {currentPage > 1 && (
        <Link href={buildHref(currentPage - 1)}>
          <Button variant="outline" size="sm">이전</Button>
        </Link>
      )}
      <span className="px-3 py-1.5">
        {currentPage} / {totalPages}
      </span>
      {currentPage < totalPages && (
        <Link href={buildHref(currentPage + 1)}>
          <Button variant="outline" size="sm">다음</Button>
        </Link>
      )}
    </>
  );
}
