"use client";

// SPEC-PROJECT-001 §2.4 — 프로젝트 수정 풀폼 (동시성 토큰 hidden field 포함).
// @MX:SPEC: SPEC-PROJECT-001
// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — 9개 chip required_skills picker. locked 상태 시 readOnly.

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
  updateProjectAction,
  type UpdateProjectFormState,
} from "@/app/(app)/(operator)/projects/[id]/edit/actions";
import { SkillsPicker } from "@/components/instructor/skills-picker";
import type { SkillCategory } from "@/lib/instructor/skill-tree";

interface ProjectInitial {
  id: string;
  title: string;
  clientId: string;
  projectType: "education" | "material_development";
  startAt: string | null; // ISO
  endAt: string | null;
  businessAmountKrw: number;
  instructorFeeKrw: number;
  notes: string | null;
  updatedAt: string;
  status: string;
  requiredSkillIds: string[];
}

interface Props {
  project: ProjectInitial;
  clients: { id: string; name: string }[];
  skills: SkillCategory[];
  locked: boolean;
}

const initialState: UpdateProjectFormState = { ok: false };

/** ISO → date input value (YYYY-MM-DD) in local timezone. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function ProjectEditForm({ project, clients, skills, locked }: Props) {
  const [state, formAction] = useFormState(updateProjectAction, initialState);
  const [selectedSkills, setSelectedSkills] = React.useState<Set<string>>(
    () => new Set(project.requiredSkillIds),
  );
  const [projectType, setProjectType] = React.useState<
    "education" | "material_development"
  >(project.projectType);

  // STALE_UPDATE 시 서버가 반환한 최신 토큰 사용. 그 외엔 props.
  const updatedAtToken = state.freshUpdatedAt ?? project.updatedAt;

  const fieldErr = (key: string) => state.fieldErrors?.[key]?.[0];

  return (
    <form action={formAction} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAtToken} />
      {/* SkillsPicker controlled state → hidden field 직렬화. */}
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
              <Input
                id="title"
                name="title"
                required
                maxLength={200}
                defaultValue={project.title}
                disabled={locked}
              />
            </Field>
            <Field label="고객사" htmlFor="clientId" required error={fieldErr("clientId")}>
              <Select name="clientId" defaultValue={project.clientId} disabled={locked}>
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
                disabled={locked}
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
              <Input
                id="startAt"
                name="startAt"
                type="date"
                defaultValue={isoToLocalInput(project.startAt)}
                disabled={locked}
              />
            </Field>
            <Field label="종료일" htmlFor="endAt" error={fieldErr("endAt")}>
              <Input
                id="endAt"
                name="endAt"
                type="date"
                defaultValue={isoToLocalInput(project.endAt)}
                disabled={locked}
              />
            </Field>
          </CardContent>
        </Card>

        {/* SPEC-SKILL-ABSTRACT-001 §3.7 — 9개 chip required_skills picker. locked 상태 시 readOnly. */}
        <SkillsPicker
          categories={skills}
          selected={selectedSkills}
          onChange={setSelectedSkills}
          readOnly={locked}
          title="필요 기술스택"
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
                defaultValue={project.businessAmountKrw}
                disabled={locked}
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
                defaultValue={project.instructorFeeKrw}
                disabled={locked}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>비고</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              name="notes"
              rows={4}
              defaultValue={project.notes ?? ""}
              disabled={locked}
            />
          </CardContent>
        </Card>
      </div>

      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">저장</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <SubmitButton disabled={locked} />
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
            {state.freshUpdatedAt && !state.ok && (
              <p className="text-xs text-[var(--color-text-muted)]">
                동시성 토큰이 갱신되었습니다. 다시 저장하면 최신 상태에서 진행됩니다.
              </p>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">
              expected_updated_at: {updatedAtToken}
            </p>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "저장 중…" : "저장"}
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
