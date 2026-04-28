"use client";

// @MX:ANCHOR: SPEC-SKILL-ABSTRACT-001 §3.7 REQ-SKILL-UI-SIMPLE — 9개 chip 단일 Card 다중선택 UI.
// @MX:REASON: 강사 폼/프로젝트 폼/리스트 필터 3개 화면이 동일 컴포넌트 재사용. controlled API 단일 패턴.
// @MX:SPEC: SPEC-ME-001 (supersede §2.4)
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { SkillCategory } from "@/lib/instructor/skill-tree";

export interface SkillsPickerProps {
  /** sort_order 순으로 정렬된 9개 카테고리 */
  categories: ReadonlyArray<SkillCategory>;
  /** 현재 선택된 카테고리 ID 집합 */
  selected: ReadonlySet<string>;
  /** 사용자가 chip을 토글할 때 호출. 새 Set을 반환 */
  onChange: (next: Set<string>) => void;
  /** 카드 헤더 표시. 기본: "강의 가능 기술스택" */
  title?: string;
  /** ARIA 레이블 (필터 등 다른 컨텍스트에서 재사용 시 변경) */
  ariaLabel?: string;
  /** read-only 모드 — recommendation-panel 재사용용. true 시 클릭 비활성. */
  readOnly?: boolean;
  /** chip 그룹의 추가 className */
  className?: string;
}

/** SPEC-SKILL-ABSTRACT-001 §3.7 — 9개 chip 다중선택 picker. */
export function SkillsPicker(props: SkillsPickerProps) {
  const {
    categories,
    selected,
    onChange,
    title = "강의 가능 기술스택",
    ariaLabel = "기술 카테고리 선택",
    readOnly = false,
    className,
  } = props;

  const handleToggle = React.useCallback(
    (id: string) => {
      if (readOnly) return;
      const next = new Set(selected);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      onChange(next);
    },
    [readOnly, selected, onChange],
  );

  if (categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--color-text-muted)]">
            기술 카테고리 데이터가 아직 준비되지 않았습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs font-normal text-[var(--color-text-muted)]">
            선택 {selected.size}개
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={ariaLabel}
        >
          {categories.map((c) => {
            const isSelected = selected.has(c.id);
            return (
              <Button
                key={c.id}
                type="button"
                variant={isSelected ? "default" : "outline"}
                size="sm"
                disabled={readOnly}
                aria-pressed={isSelected}
                data-selected={isSelected}
                onClick={() => handleToggle(c.id)}
              >
                {c.name}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default SkillsPicker;
