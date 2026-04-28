"use client";

// SPEC-PROJECT-001 §2.1 REQ-PROJECT-LIST-003/005 — 검색·필터·정렬 컨트롤.

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { STATUS_LABELS, type ProjectStatus } from "@/lib/projects";
import {
  PROJECT_SORT_KEYS,
  type ProjectListQuery,
  type ProjectSortKey,
} from "@/lib/projects/list-query";

interface ClientOption {
  id: string;
  name: string;
}
interface OperatorOption {
  id: string;
  name: string;
}

interface Props {
  query: ProjectListQuery;
  clients: ClientOption[];
  operators: OperatorOption[];
}

const SORT_LABELS: Record<ProjectSortKey, string> = {
  scheduled_at: "등록 일정",
  education_start_at: "교육 시작일",
  created_at: "생성일",
  status: "상태",
};

const STATUS_ORDER: ProjectStatus[] = [
  "proposal",
  "contract_confirmed",
  "lecture_requested",
  "instructor_sourcing",
  "assignment_review",
  "assignment_confirmed",
  "education_confirmed",
  "recruiting",
  "progress_confirmed",
  "in_progress",
  "education_done",
  "settlement_in_progress",
  "task_done",
];

export function ProjectFiltersBar({ query, clients, operators }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [qInput, setQInput] = React.useState(query.q ?? "");

  const updateParams = React.useCallback(
    (mutator: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutator(next);
      // 필터 변경 시 page=1 리셋
      next.delete("page");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const onSubmitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams((p) => {
      if (qInput.trim()) p.set("q", qInput.trim());
      else p.delete("q");
    });
  };

  const toggleStatus = (s: ProjectStatus) => {
    updateParams((p) => {
      const cur = (p.get("status") ?? "")
        .split(",")
        .filter(Boolean) as ProjectStatus[];
      const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
      if (next.length > 0) p.set("status", next.join(","));
      else p.delete("status");
    });
  };

  const setSelect = (key: string, value: string | null) => {
    updateParams((p) => {
      if (value && value !== "__ALL__") p.set(key, value);
      else p.delete(key);
    });
  };

  const setDate = (key: "startFrom" | "startTo", value: string) => {
    updateParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });
  };

  const setSort = (sort: ProjectSortKey) => {
    updateParams((p) => {
      if (sort === "scheduled_at") p.delete("sort");
      else p.set("sort", sort);
    });
  };

  const toggleOrder = () => {
    updateParams((p) => {
      const cur = p.get("order") === "asc" ? "asc" : "desc";
      const next = cur === "asc" ? "desc" : "asc";
      if (next === "desc") p.delete("order");
      else p.set("order", next);
    });
  };

  const clearAll = () => {
    setQInput("");
    router.push(pathname);
  };

  const hasAnyFilter =
    Boolean(query.q) ||
    query.status.length > 0 ||
    Boolean(query.operatorId) ||
    Boolean(query.clientId) ||
    Boolean(query.startFrom) ||
    Boolean(query.startTo);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={onSubmitSearch}
          className="relative flex-1 min-w-[200px] max-w-md"
          role="search"
        >
          <label htmlFor="project-search" className="sr-only">
            프로젝트 검색
          </label>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]" />
          <Input
            id="project-search"
            placeholder="제목·고객사 검색"
            className="pl-8"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />
        </form>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" aria-haspopup="dialog">
              상태{query.status.length > 0 && ` (${query.status.length})`}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <fieldset className="flex flex-wrap gap-1.5">
              <legend className="sr-only">상태 필터</legend>
              {STATUS_ORDER.map((s) => {
                const active = query.status.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleStatus(s)}
                    aria-pressed={active}
                    className={
                      active
                        ? "px-2 py-1 rounded-md text-xs border-2 border-[var(--color-primary)] bg-[var(--color-primary-muted)]"
                        : "px-2 py-1 rounded-md text-xs border border-[var(--color-border)]"
                    }
                  >
                    {STATUS_LABELS[s]}
                  </button>
                );
              })}
            </fieldset>
          </PopoverContent>
        </Popover>

        <Select
          value={query.operatorId ?? "__ALL__"}
          onValueChange={(v) => setSelect("operatorId", v)}
        >
          <SelectTrigger className="min-w-[140px]">
            <SelectValue placeholder="담당자" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">담당자 전체</SelectItem>
            {operators.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.clientId ?? "__ALL__"}
          onValueChange={(v) => setSelect("clientId", v)}
        >
          <SelectTrigger className="min-w-[140px]">
            <SelectValue placeholder="고객사" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">고객사 전체</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <label htmlFor="startFrom" className="sr-only">
            시작일 시작
          </label>
          <Input
            id="startFrom"
            type="date"
            value={query.startFrom ?? ""}
            onChange={(e) => setDate("startFrom", e.target.value)}
            className="w-[140px]"
          />
          <span className="text-xs text-[var(--color-text-muted)]">~</span>
          <label htmlFor="startTo" className="sr-only">
            시작일 종료
          </label>
          <Input
            id="startTo"
            type="date"
            value={query.startTo ?? ""}
            onChange={(e) => setDate("startTo", e.target.value)}
            className="w-[140px]"
          />
        </div>

        <Select value={query.sort} onValueChange={(v) => setSort(v as ProjectSortKey)}>
          <SelectTrigger className="min-w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROJECT_SORT_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleOrder}
          aria-label={`정렬 방향 ${query.order === "asc" ? "오름차순" : "내림차순"}`}
        >
          {query.order === "asc" ? "오름차순" : "내림차순"}
        </Button>

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="h-3.5 w-3.5" /> 초기화
          </Button>
        )}
      </div>

      {(query.status.length > 0 || query.operatorId || query.clientId) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {query.status.map((s) => (
            <Badge
              key={s}
              variant="info"
              className="cursor-pointer"
              onClick={() => toggleStatus(s)}
            >
              {STATUS_LABELS[s]} ✕
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
