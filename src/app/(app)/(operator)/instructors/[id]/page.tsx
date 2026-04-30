// SPEC-INSTRUCTOR-001 §2.2 — 강사 상세 (기본정보 + 진행 이력 + AI Suspense 경계).

import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { requireUser } from "@/lib/auth";
import { getInstructorDetailForOperator } from "@/lib/instructor/queries";
import { formatKoreanPhone } from "@/lib/utils";
import { formatKstDate } from "@/lib/instructor/format";
import { InstructorHistoryTable } from "@/components/instructor/instructor-history-table";
import { SatisfactionSummaryCard } from "@/components/instructor/satisfaction-summary-card";
import { DeleteInstructorButton } from "../_components/delete-instructor-button";
import { getOrGenerateInstructorSummary } from "@/lib/ai/instructor-summary-server";

export const dynamic = "force-dynamic";

async function SummarySection({ instructorId }: { instructorId: string }) {
  const result = await getOrGenerateInstructorSummary(instructorId);
  return (
    <SatisfactionSummaryCard instructorId={instructorId} result={result} />
  );
}

export default async function InstructorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;

  const detail = await getInstructorDetailForOperator(id);
  if (!detail) {
    notFound();
  }

  const initial = detail.nameKr.slice(0, 1);

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="min-h-touch min-w-touch">
          <Link href="/instructors" aria-label="강사 목록으로">
            <ChevronLeft />
          </Link>
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-base">{initial}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{detail.nameKr}</h1>
            {detail.nameEn ? (
              <p className="text-sm md:text-xs text-[var(--color-text-muted)]">
                {detail.nameEn}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/instructors/${detail.id}/edit`}>
              <Pencil className="h-4 w-4" />
              수정
            </Link>
          </Button>
          <DeleteInstructorButton
            instructorId={detail.id}
            instructorName={detail.nameKr}
          />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-sm md:text-xs text-[var(--color-text-muted)]">이메일</p>
            <p className="font-tabular">{detail.email ?? "-"}</p>
          </div>
          <div>
            <p className="text-sm md:text-xs text-[var(--color-text-muted)]">전화번호</p>
            <p className="font-tabular">{formatKoreanPhone(detail.phone)}</p>
          </div>
          <div>
            <p className="text-sm md:text-xs text-[var(--color-text-muted)]">등록일</p>
            <p className="font-tabular">{formatKstDate(detail.createdAt)}</p>
          </div>
          <div>
            <p className="text-sm md:text-xs text-[var(--color-text-muted)]">계정 연결</p>
            <p>
              {detail.userId ? (
                <Badge variant="secondary">연결됨</Badge>
              ) : (
                <Badge variant="outline">초대 대기</Badge>
              )}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-sm md:text-xs text-[var(--color-text-muted)] mb-1">
              기술스택
            </p>
            <div className="flex flex-wrap gap-1">
              {detail.skills.length === 0 ? (
                <span className="text-sm md:text-xs text-[var(--color-text-muted)]">
                  등록된 기술스택이 없습니다.
                </span>
              ) : (
                detail.skills.map((s) => (
                  <Badge key={s.id} variant="secondary">
                    {s.name}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <div className="col-span-2">
            <Button variant="outline" disabled title="이력서 화면은 SPEC-ME-001 후속 작업입니다.">
              이력서 보기 (준비 중)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>진행 이력</CardTitle>
        </CardHeader>
        <CardContent>
          <InstructorHistoryTable history={detail.history} />
        </CardContent>
      </Card>

      <Suspense
        fallback={
          <Card>
            <CardHeader>
              <CardTitle>AI 만족도 요약</CardTitle>
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-1/3 mb-2" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-5/6" />
            </CardContent>
          </Card>
        }
      >
        <SummarySection instructorId={detail.id} />
      </Suspense>
    </div>
  );
}
