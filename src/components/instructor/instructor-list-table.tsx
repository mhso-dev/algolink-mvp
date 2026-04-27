// SPEC-INSTRUCTOR-001 §2.1 + §2.7 — 리스트 테이블 + 정렬 헤더 (서버 컴포넌트).

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  formatAvgScore,
  formatKrw,
  formatKstDate,
} from "@/lib/instructor/format";
import type {
  InstructorListRow,
  InstructorListSort,
} from "@/lib/instructor/types";

type Props = {
  rows: InstructorListRow[];
  currentSort: InstructorListSort;
  currentDir: "asc" | "desc";
  baseSearch: URLSearchParams;
};

const SORTABLE_COLUMNS: { key: InstructorListSort; label: string }[] = [
  { key: "name_kr", label: "이름" },
  { key: "lecture_count", label: "강의 횟수" },
  { key: "avg_score", label: "만족도 평균" },
  { key: "last_lecture_date", label: "마지막 강의일" },
];

function buildSortHref(
  base: URLSearchParams,
  key: InstructorListSort,
  currentSort: InstructorListSort,
  currentDir: "asc" | "desc",
): string {
  const params = new URLSearchParams(base.toString());
  const nextDir =
    currentSort === key ? (currentDir === "asc" ? "desc" : "asc") : "asc";
  params.set("sort", key);
  params.set("dir", nextDir);
  params.delete("page");
  return `?${params.toString()}`;
}

function ariaSortFor(
  key: InstructorListSort,
  currentSort: InstructorListSort,
  currentDir: "asc" | "desc",
): "ascending" | "descending" | "none" {
  if (key !== currentSort) return "none";
  return currentDir === "asc" ? "ascending" : "descending";
}

export function InstructorListTable({
  rows,
  currentSort,
  currentDir,
  baseSearch,
}: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] py-16 text-center">
        <p className="text-sm font-medium mb-2">조건에 맞는 강사가 없습니다.</p>
        <Link
          href="?"
          className="text-xs text-[var(--color-primary)] underline"
        >
          필터 초기화
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {SORTABLE_COLUMNS.map((col) => {
              const ariaSort = ariaSortFor(col.key, currentSort, currentDir);
              const Icon =
                ariaSort === "ascending"
                  ? ArrowUp
                  : ariaSort === "descending"
                    ? ArrowDown
                    : ArrowUpDown;
              return (
                <TableHead key={col.key} aria-sort={ariaSort} scope="col">
                  <Link
                    href={buildSortHref(
                      baseSearch,
                      col.key,
                      currentSort,
                      currentDir,
                    )}
                    className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
                  >
                    {col.label}
                    <Icon className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </TableHead>
              );
            })}
            <TableHead scope="col">기술스택</TableHead>
            <TableHead scope="col">정산 합계</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-[var(--color-bg-muted)]">
              <TableCell className="font-medium">
                <Link
                  href={`/instructors/${row.id}`}
                  className="hover:underline"
                >
                  {row.nameKr}
                </Link>
              </TableCell>
              <TableCell className="font-tabular">{row.lectureCount}</TableCell>
              <TableCell className="font-tabular">
                {formatAvgScore(row.avgScore, row.reviewCount)}
              </TableCell>
              <TableCell className="font-tabular">
                {row.lastLectureDate
                  ? formatKstDate(row.lastLectureDate)
                  : "강의 이력 없음"}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {row.topSkills.map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="text-[10px]"
                    >
                      {s}
                    </Badge>
                  ))}
                  {row.totalSkillCount > row.topSkills.length ? (
                    <Badge variant="outline" className="text-[10px]">
                      +{row.totalSkillCount - row.topSkills.length}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="font-tabular">
                {formatKrw(row.settlementTotalKrw)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
