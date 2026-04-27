// SPEC-INSTRUCTOR-001 §2.1 — 강사 리스트 (operator/admin).

import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import {
  getAllSkillCategories,
  listInstructorsForOperator,
} from "@/lib/instructor/queries";
import { instructorListFilterSchema } from "@/lib/validation/instructor";
import { InstructorListFilters } from "@/components/instructor/instructor-list-filters";
import { InstructorListTable } from "@/components/instructor/instructor-list-table";
import { InstructorPagination } from "@/components/instructor/pagination";
import type { InstructorListSort } from "@/lib/instructor/types";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function parseSkillIds(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.flatMap((v) => v.split(","));
  return raw.split(",").filter(Boolean);
}

export default async function InstructorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireUser();
  const sp = await searchParams;

  const parsed = instructorListFilterSchema.safeParse({
    name: typeof sp.name === "string" ? sp.name : undefined,
    skillIds: parseSkillIds(sp.skillIds),
    scoreMin: sp.scoreMin,
    scoreMax: sp.scoreMax,
    sort: typeof sp.sort === "string" ? sp.sort : undefined,
    dir: typeof sp.dir === "string" ? sp.dir : undefined,
    page: sp.page ?? 1,
    pageSize: 20,
  });

  if (!parsed.success) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-6">
        <p className="text-sm text-[var(--color-state-alert)]" role="alert">
          {parsed.error.issues[0]?.message ?? "잘못된 필터입니다."}
        </p>
      </div>
    );
  }

  const filter = parsed.data;
  const sort: InstructorListSort = filter.sort ?? "name_kr";
  const dir = filter.dir ?? "asc";

  const [{ rows, total }, skills] = await Promise.all([
    listInstructorsForOperator({
      ...filter,
      sort,
      dir,
    }),
    getAllSkillCategories(),
  ]);

  const baseSearch = new URLSearchParams();
  if (filter.name) baseSearch.set("name", filter.name);
  if (filter.skillIds && filter.skillIds.length > 0)
    baseSearch.set("skillIds", filter.skillIds.join(","));
  if (filter.scoreMin !== undefined)
    baseSearch.set("scoreMin", String(filter.scoreMin));
  if (filter.scoreMax !== undefined)
    baseSearch.set("scoreMax", String(filter.scoreMax));
  baseSearch.set("sort", sort);
  baseSearch.set("dir", dir);

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-[var(--color-primary)]" />
            강사 관리
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            강사진 {total}명 — 검색·필터·정렬로 빠르게 찾으세요.
          </p>
        </div>
        <Button asChild>
          <Link href="/instructors/new">
            <Plus /> 강사 등록
          </Link>
        </Button>
      </header>

      <InstructorListFilters
        skills={skills}
        initialName={filter.name}
        initialSkillIds={filter.skillIds}
        initialScoreMin={filter.scoreMin}
        initialScoreMax={filter.scoreMax}
        resultCount={total}
      />

      <InstructorListTable
        rows={rows}
        currentSort={sort}
        currentDir={dir}
        baseSearch={baseSearch}
      />

      <InstructorPagination
        page={filter.page}
        pageSize={filter.pageSize}
        total={total}
        baseSearch={baseSearch}
      />
    </div>
  );
}
