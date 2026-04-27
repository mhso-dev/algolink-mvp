// SPEC-INSTRUCTOR-001 §2.2 REQ-INSTRUCTOR-DETAIL-003/004 — 진행 이력 테이블.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatKstDate } from "@/lib/instructor/format";
import type { InstructorHistoryRow } from "@/lib/instructor/types";

const COMMENT_TRUNCATE = 80;

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n).trim()}…`;
}

export function InstructorHistoryTable({
  history,
}: {
  history: InstructorHistoryRow[];
}) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-4">
        아직 진행한 강의가 없습니다.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">프로젝트명</TableHead>
          <TableHead scope="col">기간</TableHead>
          <TableHead scope="col">만족도</TableHead>
          <TableHead scope="col">코멘트</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map((row) => (
          <TableRow key={row.projectId}>
            <TableCell className="font-medium">{row.projectTitle}</TableCell>
            <TableCell className="text-xs font-tabular">
              {row.startDate ? formatKstDate(row.startDate) : "-"} ~{" "}
              {row.endDate ? formatKstDate(row.endDate) : "-"}
            </TableCell>
            <TableCell>
              {row.score !== null ? (
                <Badge variant="secondary" className="font-tabular">
                  {row.score}/5
                </Badge>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">-</span>
              )}
            </TableCell>
            <TableCell className="text-xs">
              {row.comment ? (
                <span title={row.comment}>
                  {truncate(row.comment, COMMENT_TRUNCATE)}
                </span>
              ) : (
                <span className="text-[var(--color-text-muted)]">-</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
