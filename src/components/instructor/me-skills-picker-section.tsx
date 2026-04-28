"use client";

// @MX:NOTE: SPEC-SKILL-ABSTRACT-001 §3.2/§3.7 — /me/resume의 client 측 SkillsPicker 래퍼.
// @MX:REASON: SkillsPicker는 controlled API. 서버 컴포넌트(/me/resume/page.tsx)와 controlled state를 분리하기 위해 client 래퍼가 필요.
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001

import * as React from "react";
import { toast } from "sonner";
import { SkillsPicker } from "./skills-picker";
import { updateSkill } from "@/app/(app)/(instructor)/me/resume/actions";
import type { SkillCategory } from "@/lib/instructor/skill-tree";

interface Props {
  categories: ReadonlyArray<SkillCategory>;
  initialSelectedIds: ReadonlyArray<string>;
}

/**
 * 강사 본인 /me/resume 화면의 SkillsPicker controlled wrapper.
 * chip 클릭 시 server action을 호출하고 optimistic 적용한다.
 */
export function MeSkillsPickerSection({ categories, initialSelectedIds }: Props) {
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );
  const [isPending, startTransition] = React.useTransition();

  const handleChange = React.useCallback(
    (next: Set<string>) => {
      // diff 계산 — 어떤 chip이 토글되었는지 식별.
      const previous = selected;
      let changedId: string | null = null;
      let nowSelected = false;
      for (const id of next) {
        if (!previous.has(id)) {
          changedId = id;
          nowSelected = true;
          break;
        }
      }
      if (changedId === null) {
        for (const id of previous) {
          if (!next.has(id)) {
            changedId = id;
            nowSelected = false;
            break;
          }
        }
      }
      if (changedId === null) return;

      const targetId = changedId;
      const targetSelected = nowSelected;

      // optimistic UI 적용
      setSelected(next);

      startTransition(async () => {
        const r = await updateSkill({ skillId: targetId, selected: targetSelected });
        if (!r.ok) {
          toast.error(r.message ?? "기술스택 저장에 실패했습니다.");
          // 롤백
          setSelected(previous);
        }
      });
    },
    [selected],
  );

  return (
    <SkillsPicker
      categories={categories}
      selected={selected}
      onChange={handleChange}
      readOnly={isPending}
    />
  );
}
