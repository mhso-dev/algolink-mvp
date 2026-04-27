"use client";

// SPEC-INSTRUCTOR-001 §2.3 — 강사 등록 폼 (zod + Server Action).

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createInstructorAndInvite } from "@/app/(app)/(operator)/instructors/new/actions";

type SkillOption = { id: string; name: string };

export function InstructorForm({ skills }: { skills: SkillOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    // checkbox는 form에서 자동 수집되지만 명시적으로 selectedSkills를 사용.
    fd.delete("skillIds");
    for (const id of selectedSkills) fd.append("skillIds", id);
    startTransition(async () => {
      const r = await createInstructorAndInvite(fd);
      if (!r.ok) setError(r.error);
      // 성공 시 redirect()가 throw되므로 아래는 도달 안 함.
    });
  }

  function toggleSkill(id: string) {
    setSelectedSkills((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
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

      {skills.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">기본 기술스택 (선택)</legend>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {skills.map((s) => {
              const checked = selectedSkills.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`text-xs px-2 py-1 rounded border cursor-pointer select-none ${
                    checked
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleSkill(s.id)}
                  />
                  {s.name}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

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
