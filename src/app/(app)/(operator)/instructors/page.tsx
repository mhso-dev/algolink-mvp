import { cookies } from "next/headers";
import Link from "next/link";
import { Plus, Search, Filter, Sparkles, FileText, Users } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { requireUser } from "@/lib/auth";
import { formatRating, formatKoreanPhone } from "@/lib/utils";

export const dynamic = "force-dynamic";

type InstructorSafe = {
  id: string;
  name_kr: string | null;
  email: string | null;
  phone: string | null;
};

export default async function InstructorsPage() {
  await requireUser();
  const supabase = createClient(await cookies());

  const { data, error } = await supabase
    .from("instructors_safe")
    .select("id, name_kr, email, phone")
    .order("name_kr", { ascending: true })
    .returns<InstructorSafe[]>();

  const instructors = data ?? [];

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-[var(--color-primary)]" />
            강사 관리
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            강사진 {instructors.length}명 — 검색·필터·만족도 정렬로 빠르게 찾으세요.
          </p>
        </div>
        <Button>
          <Plus /> 강사 등록
        </Button>
      </header>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]" />
            <Input placeholder="이름·이메일·기술스택 검색" className="pl-8" />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-3.5 w-3.5" /> 기술스택
          </Button>
          <Button variant="outline" size="sm">
            <Filter className="h-3.5 w-3.5" /> 만족도
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {error ? (
          <p className="p-6 text-sm text-[var(--color-state-alert)]">
            데이터 조회 오류: {error.message}
          </p>
        ) : instructors.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm font-medium mb-2">등록된 강사가 없어요</p>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">
              새 강사를 등록하거나 PDF 이력서를 업로드해 시작해 보세요.
            </p>
            <Button>
              <Plus /> 강사 등록
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>연락처</TableHead>
                <TableHead>경력</TableHead>
                <TableHead>최근 만족도</TableHead>
                <TableHead>주요 기술스택</TableHead>
                <TableHead className="w-44">AI 역량 요약</TableHead>
                <TableHead className="w-24 text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructors.map((inst) => (
                <TableRow key={inst.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar>
                        <AvatarFallback>{(inst.name_kr ?? "?").slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{inst.name_kr ?? "(이름 미공개)"}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {inst.email ?? "—"}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-tabular">
                    {formatKoreanPhone(inst.phone)}
                  </TableCell>
                  <TableCell className="text-sm text-[var(--color-text-muted)]">
                    이력서 미입력
                  </TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="settled" className="font-tabular">
                      {formatRating(null)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-[10px]">
                        준비 중
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                      <Sparkles className="h-3 w-3 text-[var(--color-primary)]" />
                      <span className="line-clamp-1">강의이력 누적 시 자동 생성</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/instructors/${inst.id}`}>
                        <FileText className="h-3.5 w-3.5" /> 상세
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-[var(--color-text-muted)] text-center">
        강사 클릭 시 상세 사이드 패널(진행 이력 / 정산 합계 / 만족도 평균 / AI 만족도 요약)이 열립니다. (다음 단계)
      </p>
    </div>
  );
}
