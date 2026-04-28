"use client";

// SPEC-PROJECT-001 §2.2 — 신규 프로젝트 등록 폼 (Server Action 연동).
// @MX:SPEC: SPEC-PROJECT-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — 9개 chip required_skills picker (max 9, controlled).

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createProjectAction,
  type CreateProjectFormState,
} from "@/app/(app)/(operator)/projects/new/actions";
import { SkillsPicker } from "@/components/instructor/skills-picker";
import type { SkillCategory } from "@/lib/instructor/skill-tree";

interface Props {
  clients: { id: string; name: string }[];
  skills: SkillCategory[];
}

const initialState: CreateProjectFormState = { ok: false };

export function ProjectCreateForm({ clients, skills }: Props) {
  // useFormState 는 Next 16 에서 useActionState 로 alias 가능. 호환을 위해 그대로 사용.
  const [state, formAction] = useFormState(createProjectAction, initialState);
  const [selectedSkills, setSelectedSkills] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [projectType, setProjectType] = React.useState<"education" | "material_development">(
    "education",
  );

  const fieldErr = (key: string) => state.fieldErrors?.[key]?.[0];

  return (
    <form action={formAction} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      {/* SkillsPicker는 controlled state — selectedSkills를 hidden field로 직렬화. */}
      {Array.from(selectedSkills).map((id) => (
        <input key={id} type="hidden" name="requiredSkillIds[]" value={id} />
      ))}
      <div className="flex flex-col gap-4 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="제목" htmlFor="title" required error={fieldErr("title")}>
              <Input id="title" name="title" required maxLength={200} />
            </Field>
            <Field label="고객사" htmlFor="clientId" required error={fieldErr("clientId")}>
              <Select name="clientId" required>
                <SelectTrigger id="clientId">
                  <SelectValue placeholder="고객사 선택" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="프로젝트 유형" htmlFor="projectType">
              <Select
                name="projectType"
                value={projectType}
                onValueChange={(v) =>
                  setProjectType(v as "education" | "material_development")
                }
              >
                <SelectTrigger id="projectType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="education">교육</SelectItem>
                  <SelectItem value="material_development">교재 개발</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="시작일" htmlFor="startAt" error={fieldErr("startAt")}>
              <Input id="startAt" name="startAt" type="date" />
            </Field>
            <Field label="종료일" htmlFor="endAt" error={fieldErr("endAt")}>
              <Input id="endAt" name="endAt" type="date" />
            </Field>
          </CardContent>
        </Card>

        {/* SPEC-SKILL-ABSTRACT-001 §3.7 — 9개 chip required_skills picker. */}
        <SkillsPicker
          categories={skills}
          selected={selectedSkills}
          onChange={setSelectedSkills}
          title="필요 기술스택 (선택)"
          ariaLabel="프로젝트 필요 기술 카테고리"
        />

        <Card>
          <CardHeader>
            <CardTitle>금액</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="사업비 (원)"
              htmlFor="businessAmountKrw"
              error={fieldErr("businessAmountKrw")}
            >
              <Input
                id="businessAmountKrw"
                name="businessAmountKrw"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={0}
              />
            </Field>
            <Field
              label="강사비 (원)"
              htmlFor="instructorFeeKrw"
              error={fieldErr("instructorFeeKrw")}
            >
              <Input
                id="instructorFeeKrw"
                name="instructorFeeKrw"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={0}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>비고</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea name="notes" rows={4} placeholder="필요 시 메모" />
          </CardContent>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">제출</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <SubmitButton />
            {state.message && (
              <p
                role={state.ok ? "status" : "alert"}
                className={
                  state.ok
                    ? "text-sm text-[var(--color-state-settled)]"
                    : "text-sm text-[var(--color-state-alert)]"
                }
              >
                {state.message}
              </p>
            )}
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "등록 중…" : "등록"}
    </Button>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error && (
        <p
          role="alert"
          id={`${htmlFor}-error`}
          className="text-xs text-[var(--color-state-alert)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
