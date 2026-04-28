"use client";

// SPEC-INSTRUCTOR-001 §2.1 — 리스트 필터 (이름/스킬/만족도 범위) URL state.
// @MX:SPEC: SPEC-INSTRUCTOR-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — 9개 chip SkillsPicker 다중선택, ANY-match.

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RotateCcw } from "lucide-react";
import { SkillsPicker } from "./skills-picker";
import type { SkillCategory } from "@/lib/instructor/skill-tree";

type Props = {
  skills: SkillCategory[];
  initialName?: string;
  initialSkillIds?: string[];
  initialScoreMin?: number;
  initialScoreMax?: number;
  resultCount: number;
};

export function InstructorListFilters({
  skills,
  initialName,
  initialSkillIds,
  initialScoreMin,
  initialScoreMax,
  resultCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(initialName ?? "");
  const [skillIds, setSkillIds] = useState<Set<string>>(
    () => new Set(initialSkillIds ?? []),
  );
  const [scoreMin, setScoreMin] = useState<string>(
    initialScoreMin !== undefined ? String(initialScoreMin) : "",
  );
  const [scoreMax, setScoreMax] = useState<string>(
    initialScoreMax !== undefined ? String(initialScoreMax) : "",
  );

  // Debounce name 변경.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(search.toString());
      if (name.trim()) params.set("name", name.trim());
      else params.delete("name");
      params.delete("page");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  function applyFilters() {
    const params = new URLSearchParams(search.toString());
    if (skillIds.size > 0) {
      params.set("skillIds", Array.from(skillIds).join(","));
    } else {
      params.delete("skillIds");
    }
    if (scoreMin) params.set("scoreMin", scoreMin);
    else params.delete("scoreMin");
    if (scoreMax) params.set("scoreMax", scoreMax);
    else params.delete("scoreMax");
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function reset() {
    setName("");
    setSkillIds(new Set());
    setScoreMin("");
    setScoreMax("");
    startTransition(() => {
      router.push(pathname);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label
            htmlFor="instructor-name-search"
            className="text-xs font-medium block mb-1"
          >
            이름 검색
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-subtle)]"
              aria-hidden="true"
            />
            <Input
              id="instructor-name-search"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름으로 검색"
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex flex-col">
          <label htmlFor="score-min" className="text-xs font-medium mb-1">
            만족도 (최소)
          </label>
          <Input
            id="score-min"
            type="number"
            inputMode="decimal"
            min={0}
            max={5}
            step={0.1}
            value={scoreMin}
            onChange={(e) => setScoreMin(e.target.value)}
            className="w-24"
          />
        </div>
        <div className="flex flex-col">
          <label htmlFor="score-max" className="text-xs font-medium mb-1">
            만족도 (최대)
          </label>
          <Input
            id="score-max"
            type="number"
            inputMode="decimal"
            min={0}
            max={5}
            step={0.1}
            value={scoreMax}
            onChange={(e) => setScoreMax(e.target.value)}
            className="w-24"
          />
        </div>

        <Button onClick={applyFilters} disabled={isPending} type="button">
          필터 적용
        </Button>
        <Button
          onClick={reset}
          variant="outline"
          type="button"
          disabled={isPending}
        >
          <RotateCcw className="h-3.5 w-3.5" /> 필터 초기화
        </Button>
      </div>

      {/* SPEC-SKILL-ABSTRACT-001 §3.7 — 9개 chip 다중선택. ANY-match (선택 카테고리 중 하나라도 보유). */}
      <SkillsPicker
        categories={skills}
        selected={skillIds}
        onChange={setSkillIds}
        title="기술스택 필터 (다중 선택)"
        ariaLabel="강사 기술스택 다중 필터"
      />

      <p
        role="status"
        aria-live="polite"
        className="text-xs text-[var(--color-text-muted)]"
      >
        {resultCount}명의 강사가 검색되었습니다.
      </p>
    </div>
  );
}
