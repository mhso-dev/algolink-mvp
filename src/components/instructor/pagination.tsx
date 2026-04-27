import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  baseSearch: URLSearchParams;
};

function hrefForPage(base: URLSearchParams, page: number): string {
  const params = new URLSearchParams(base.toString());
  if (page === 1) params.delete("page");
  else params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "?";
}

export function InstructorPagination({
  page,
  pageSize,
  total,
  baseSearch,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav
      className="flex items-center justify-between gap-3"
      aria-label="강사 목록 페이지네이션"
    >
      <p className="text-xs text-[var(--color-text-muted)]">
        총 {total}명 · {page} / {totalPages} 페이지
      </p>
      <div className="flex items-center gap-2">
        <Button
          asChild={!prevDisabled}
          variant="outline"
          size="sm"
          disabled={prevDisabled}
          aria-disabled={prevDisabled}
        >
          {prevDisabled ? (
            <span>
              <ChevronLeft className="h-3.5 w-3.5" /> 이전
            </span>
          ) : (
            <Link href={hrefForPage(baseSearch, page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" /> 이전
            </Link>
          )}
        </Button>
        <Button
          asChild={!nextDisabled}
          variant="outline"
          size="sm"
          disabled={nextDisabled}
          aria-disabled={nextDisabled}
        >
          {nextDisabled ? (
            <span>
              다음 <ChevronRight className="h-3.5 w-3.5" />
            </span>
          ) : (
            <Link href={hrefForPage(baseSearch, page + 1)}>
              다음 <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </Button>
      </div>
    </nav>
  );
}
