"use client";

// SPEC-INSTRUCTOR-001 §2.3 — 강사 등록 폼 (zod + Server Action).
// @MX:SPEC: SPEC-INSTRUCTOR-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — 9개 chip SkillsPicker 통합.

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createInstructorAndInvite } from "@/app/(app)/(operator)/instructors/new/actions";
import { SkillsPicker } from "./skills-picker";
import type { SkillCategory } from "@/lib/instructor/skill-tree";

export function InstructorForm({ skills }: { skills: SkillCategory[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(
    () => new Set(),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    // SkillsPicker가 controlled state → form FormData에 직렬화.
    fd.delete("skillIds");
    for (const id of selectedSkills) fd.append("skillIds", id);
    startTransition(async () => {
      const r = await createInstructorAndInvite(fd);
      if (!r.ok) setError(r.error);
      // 성공 시 redirect()가 throw되므로 아래는 도달 안 함.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-xl">
      <div className="flex flex-col gap-1">
        <Label htmlFor="nameKr">이름 *</Label>
        <Input id="nameKr" name="nameKr" required maxLength={100} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="nameEn">영문명 (선택)</Label>
        <Input id="nameEn" name="nameEn" maxLength={100} />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="email">이메일 *</Label>
        <Input id="email" name="email" type="email" required />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="phone">전화번호 (선택)</Label>
        <Input
          id="phone"
          name="phone"
          inputMode="tel"
          placeholder="010-1234-5678"
        />
      </div>

      {/* SPEC-SKILL-ABSTRACT-001 §3.7 — 9개 chip 다중선택 SkillsPicker. */}
      <SkillsPicker
        categories={skills}
        selected={selectedSkills}
        onChange={setSelectedSkills}
        title="기본 기술스택 (선택)"
        ariaLabel="강사 기본 기술 카테고리 선택"
      />

      {error ? (
        <p
          role="alert"
          aria-live="assertive"
          className="text-sm text-[var(--color-state-alert)]"
        >
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "등록 중..." : "등록 + 초대 발송"}
        </Button>
      </div>
    </form>
  );
}
