import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { ChevronLeft, FileText } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { requireUser } from "@/lib/auth";
import { formatKoreanPhone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InstructorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const supabase = createClient(await cookies());

  const { data, error } = await supabase
    .from("instructors_safe")
    .select("id, name_kr, email, phone")
    .eq("id", id)
    .maybeSingle<{ id: string; name_kr: string | null; email: string | null; phone: string | null }>();

  if (error || !data) {
    notFound();
  }

  const initial = (data.name_kr ?? "?").slice(0, 1);

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/instructors" aria-label="강사 목록으로">
            <ChevronLeft />
          </Link>
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-base">{initial}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{data.name_kr ?? "(이름 미공개)"}</h1>
            <p className="text-xs text-[var(--color-text-muted)] font-tabular">
              {data.email} · {formatKoreanPhone(data.phone)}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/instructors/${id}/resume`}>
              <FileText /> 이력서 보기
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>진행 이력</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-text-muted)]">
            교육 횟수·정산 합계·만족도 평균이 여기 표시됩니다. (다음 단계)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI 만족도 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-text-muted)]">
            누적 만족도 코멘트를 Claude API로 요약해 표시합니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
