// SPEC-PROPOSAL-001 §M4/M5/M6 REQ-PROPOSAL-DETAIL-* — 제안서 상세 페이지 (RSC).
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { formatKRW } from "@/lib/utils";
import {
  getInquiriesForProposal,
  getProposalById,
  getProposalRequiredSkills,
} from "@/lib/proposals/queries";
import { isFrozenProposalStatus } from "@/lib/proposals/types";
import { ProposalStatusBadge } from "@/components/proposals/ProposalStatusBadge";
import { InquiryResponseBoard } from "@/components/proposals/InquiryResponseBoard";
import { StatusControls } from "@/components/proposals/StatusControls";
import { InquiryDispatchTrigger } from "@/components/proposals/InquiryDispatchTrigger";
import { ConvertToProjectButton } from "@/components/proposals/ConvertToProjectButton";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProposalDetailPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const supabase = createClient(await cookies());

  const proposal = await getProposalById(supabase, id);
  if (!proposal) notFound();

  const [skills, inquiries, instructorsRes] = await Promise.all([
    getProposalRequiredSkills(supabase, id),
    getInquiriesForProposal(supabase, id),
    supabase
      .from("instructors")
      .select("id, name, display_name")
      .order("name"),
  ]);

  const instructors = (instructorsRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    display_name?: string | null;
  }>;

  const frozen = isFrozenProposalStatus(proposal.status);

  return (
    <div className="container mx-auto py-8 max-w-5xl space-y-6">
      <Link
        href="/proposals"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        제안서 목록
      </Link>

      {/* (a) 요약 헤더 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-2xl">{proposal.title}</CardTitle>
              <p className="text-muted-foreground mt-1">
                {proposal.client_name ?? "-"} · 담당자{" "}
                {proposal.operator_name ?? "-"}
              </p>
            </div>
            <ProposalStatusBadge status={proposal.status} />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">기간</div>
            <div>
              {proposal.proposed_period_start && proposal.proposed_period_end
                ? `${proposal.proposed_period_start} ~ ${proposal.proposed_period_end}`
                : "-"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">사업비</div>
            <div className="tabular-nums">
              {proposal.proposed_business_amount_krw != null
                ? formatKRW(proposal.proposed_business_amount_krw)
                : "-"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">시급</div>
            <div className="tabular-nums">
              {proposal.proposed_hourly_rate_krw != null
                ? formatKRW(proposal.proposed_hourly_rate_krw)
                : "-"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">등록일</div>
            <div>{format(new Date(proposal.created_at), "yyyy-MM-dd")}</div>
          </div>
          {proposal.submitted_at && (
            <div>
              <div className="text-muted-foreground">제출일</div>
              <div>{format(new Date(proposal.submitted_at), "yyyy-MM-dd")}</div>
            </div>
          )}
          {proposal.decided_at && (
            <div>
              <div className="text-muted-foreground">결정일</div>
              <div>{format(new Date(proposal.decided_at), "yyyy-MM-dd")}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* (b) 상태 컨트롤 + (g) Won 변환 컨트롤 */}
      {!frozen && (
        <div className="flex flex-wrap gap-2 items-center">
          <StatusControls
            proposalId={proposal.id}
            currentStatus={proposal.status}
            expectedUpdatedAt={proposal.updated_at}
          />
          {proposal.status === "submitted" && (
            <ConvertToProjectButton proposalId={proposal.id} />
          )}
          <Link href={`/proposals/${proposal.id}/edit`}>
            <Button variant="outline">수정</Button>
          </Link>
        </div>
      )}

      {frozen && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline">확정됨</Badge>
              <p className="text-sm text-muted-foreground">
                확정된 제안서는 수정할 수 없습니다.
              </p>
            </div>
            {proposal.status === "won" && proposal.converted_project_id && (
              <Link
                href={`/projects/${proposal.converted_project_id}`}
                className="inline-flex items-center text-sm hover:underline mt-2"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                프로젝트로 이동
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* (c) 기술스택 태그 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">필요 기술스택</CardTitle>
        </CardHeader>
        <CardContent>
          {skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">미지정</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <Badge key={s.skill_id} variant="secondary">
                  {s.skill_name ?? "-"}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* (e) 사전 강사 문의 디스패치 패널 */}
      {!frozen && (
        <InquiryDispatchTrigger
          proposalId={proposal.id}
          proposalTitle={proposal.title}
          instructors={instructors}
        />
      )}

      {/* (f) 응답 보드 */}
      <InquiryResponseBoard entries={inquiries} />

      {/* 메모 */}
      {proposal.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">메모</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{proposal.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
