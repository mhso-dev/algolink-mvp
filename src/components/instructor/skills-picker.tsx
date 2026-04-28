"use client";

// SPEC-ME-001 §2.4 REQ-ME-SKILL-001~005 — 3-tier 강의 가능 기술스택 picker.
// @MX:NOTE: large는 Tabs로 분리, medium은 그룹 헤더, small은 체크박스 + proficiency select.
// REQ-ME-SKILL-002 toggle, REQ-ME-SKILL-004 검색, REQ-ME-SKILL-005 medium/large 비-인터랙티브.

import * as React from "react";
import { Search, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  buildSkillTree,
  filterSkillTree,
  indexSelections,
  type SkillCategoryRow,
  type Proficiency,
} from "@/lib/instructor/skill-tree";
import { updateSkill } from "@/app/(app)/(instructor)/me/resume/actions";

interface SkillsPickerProps {
  categories: SkillCategoryRow[];
  initialSelections: Array<{ skillId: string; proficiency: Proficiency; name?: string }>;
}

const PROFICIENCY_OPTIONS: { value: Proficiency; label: string }[] = [
  { value: "beginner", label: "초급" },
  { value: "intermediate", label: "중급" },
  { value: "advanced", label: "고급" },
  { value: "expert", label: "전문가" },
];

export function SkillsPicker({ categories, initialSelections }: SkillsPickerProps) {
  const baseTree = React.useMemo(() => buildSkillTree(categories), [categories]);
  const [query, setQuery] = React.useState("");
  const [selectionMap, setSelectionMap] = React.useState<Map<string, Proficiency>>(
    () => indexSelections(initialSelections),
  );
  const [isPending, startTransition] = React.useTransition();

  // skillId → display name (선택된 칩 표시용)
  const skillNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) if (c.tier === "small") m.set(c.id, c.name);
    return m;
  }, [categories]);

  const filteredTree = React.useMemo(
    () => filterSkillTree(baseTree, query),
    [baseTree, query],
  );

  const selectedSummary = React.useMemo(() => {
    return Array.from(selectionMap.entries()).map(([skillId, proficiency]) => ({
      skillId,
      proficiency,
      name: skillNameById.get(skillId) ?? skillId,
    }));
  }, [selectionMap, skillNameById]);

  const persist = React.useCallback(
    (skillId: string, proficiency: Proficiency | null) => {
      startTransition(async () => {
        const r = await updateSkill({ skillId, proficiency });
        if (!r.ok) {
          toast.error(r.message ?? "기술스택 저장에 실패했습니다.");
          return;
        }
        // optimistic 적용
        setSelectionMap((prev) => {
          const next = new Map(prev);
          if (proficiency === null) next.delete(skillId);
          else next.set(skillId, proficiency);
          return next;
        });
      });
    },
    [],
  );

  const handleToggle = React.useCallback(
    (skillId: string, checked: boolean) => {
      if (checked) {
        // 새로 선택 시 기본 proficiency = intermediate
        persist(skillId, "intermediate");
      } else {
        persist(skillId, null);
      }
    },
    [persist],
  );

  const handleProficiencyChange = React.useCallback(
    (skillId: string, value: Proficiency) => {
      persist(skillId, value);
    },
    [persist],
  );

  if (baseTree.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>강의 가능 기술스택</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-text-muted)]">
            기술 카테고리 데이터가 아직 준비되지 않았습니다. 운영자에게 문의해주세요.
          </p>
        </CardContent>
      </Card>
    );
  }

  const firstLargeId = baseTree[0]!.id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>강의 가능 기술스택</span>
          <span className="text-xs font-normal text-[var(--color-text-muted)]">
            선택 {selectedSummary.length}개
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 선택된 칩 */}
        {selectedSummary.length > 0 && (
          <div
            className="flex flex-wrap gap-2"
            role="region"
            aria-label="선택된 기술스택 목록"
          >
            {selectedSummary.map((s) => (
              <Badge
                key={s.skillId}
                variant="secondary"
                className="flex items-center gap-1.5 pl-2 pr-1 py-1"
              >
                <span>{s.name}</span>
                <span className="text-[10px] text-[var(--color-text-muted)] uppercase">
                  {PROFICIENCY_OPTIONS.find((p) => p.value === s.proficiency)?.label}
                </span>
                <button
                  type="button"
                  onClick={() => persist(s.skillId, null)}
                  disabled={isPending}
                  aria-label={`${s.name} 삭제`}
                  className="ml-0.5 rounded-sm p-0.5 hover:bg-[var(--color-surface-2)]"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* 검색 */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
          <Input
            type="search"
            placeholder="기술명으로 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
            aria-label="기술스택 검색"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQuery("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7"
            >
              지우기
            </Button>
          )}
        </div>

        {/* 검색 모드: 트리 평면 표시 / 일반 모드: Tabs */}
        {query.trim() ? (
          <SearchResults
            tree={filteredTree}
            selectionMap={selectionMap}
            isPending={isPending}
            onToggle={handleToggle}
            onProficiencyChange={handleProficiencyChange}
          />
        ) : (
          <Tabs defaultValue={firstLargeId} className="w-full">
            <TabsList
              className="flex flex-wrap h-auto justify-start"
              aria-label="기술 대분류"
            >
              {baseTree.map((large) => (
                <TabsTrigger key={large.id} value={large.id}>
                  {large.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {baseTree.map((large) => (
              <TabsContent key={large.id} value={large.id} className="mt-4 space-y-4">
                {large.mediums.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    이 분류에는 아직 등록된 기술이 없습니다.
                  </p>
                ) : (
                  large.mediums.map((medium) => (
                    <MediumGroup
                      key={medium.id}
                      mediumName={medium.name}
                      smalls={medium.smalls}
                      selectionMap={selectionMap}
                      isPending={isPending}
                      onToggle={handleToggle}
                      onProficiencyChange={handleProficiencyChange}
                    />
                  ))
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function MediumGroup(props: {
  mediumName: string;
  smalls: ReadonlyArray<{ id: string; name: string }>;
  selectionMap: Map<string, Proficiency>;
  isPending: boolean;
  onToggle: (skillId: string, checked: boolean) => void;
  onProficiencyChange: (skillId: string, value: Proficiency) => void;
}) {
  const { mediumName, smalls, selectionMap, isPending, onToggle, onProficiencyChange } = props;
  if (smalls.length === 0) return null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-[var(--color-text-muted)]">
        {mediumName}
      </legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {smalls.map((s) => {
          const proficiency = selectionMap.get(s.id);
          const checked = proficiency !== undefined;
          return (
            <SkillRow
              key={s.id}
              id={s.id}
              name={s.name}
              checked={checked}
              proficiency={proficiency}
              isPending={isPending}
              onToggle={onToggle}
              onProficiencyChange={onProficiencyChange}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

function SearchResults(props: {
  tree: ReturnType<typeof buildSkillTree>;
  selectionMap: Map<string, Proficiency>;
  isPending: boolean;
  onToggle: (skillId: string, checked: boolean) => void;
  onProficiencyChange: (skillId: string, value: Proficiency) => void;
}) {
  const { tree, selectionMap, isPending, onToggle, onProficiencyChange } = props;
  if (tree.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] text-center py-4">
        검색 결과가 없습니다.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {tree.map((large) => (
        <div key={large.id} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            {large.name}
          </p>
          {large.mediums.map((m) => (
            <MediumGroup
              key={m.id}
              mediumName={m.name}
              smalls={m.smalls}
              selectionMap={selectionMap}
              isPending={isPending}
              onToggle={onToggle}
              onProficiencyChange={onProficiencyChange}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function SkillRow(props: {
  id: string;
  name: string;
  checked: boolean;
  proficiency: Proficiency | undefined;
  isPending: boolean;
  onToggle: (skillId: string, checked: boolean) => void;
  onProficiencyChange: (skillId: string, value: Proficiency) => void;
}) {
  const { id, name, checked, proficiency, isPending, onToggle, onProficiencyChange } = props;
  const checkboxId = `skill-${id}`;
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1.5">
      <Checkbox
        id={checkboxId}
        checked={checked}
        disabled={isPending}
        onCheckedChange={(v) => onToggle(id, v === true)}
      />
      <Label htmlFor={checkboxId} className="flex-1 cursor-pointer text-sm">
        {name}
      </Label>
      {checked && proficiency && (
        <select
          value={proficiency}
          disabled={isPending}
          onChange={(e) => onProficiencyChange(id, e.target.value as Proficiency)}
          aria-label={`${name} 숙련도`}
          className="text-xs rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5"
        >
          {PROFICIENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
