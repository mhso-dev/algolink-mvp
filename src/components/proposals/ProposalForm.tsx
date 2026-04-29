"use client";

// SPEC-PROPOSAL-001 §M4 — 제안서 등록/수정 공용 폼.
import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CreateProposalState } from "@/app/(app)/(operator)/proposals/new/actions";

interface ClientOption {
  id: string;
  company_name: string;
}
interface SkillOption {
  id: string;
  name: string;
}

interface Props {
  mode: "create" | "edit";
  clients: ClientOption[];
  skills: SkillOption[];
  action: (
    prev: CreateProposalState | undefined,
    fd: FormData,
  ) => Promise<CreateProposalState>;
  initial?: {
    id?: string;
    title?: string;
    clientId?: string;
    proposedPeriodStart?: string | null;
    proposedPeriodEnd?: string | null;
    proposedBusinessAmountKrw?: number | null;
    proposedHourlyRateKrw?: number | null;
    notes?: string | null;
    requiredSkillIds?: string[];
    expectedUpdatedAt?: string;
  };
}

export function ProposalForm({ mode, clients, skills, action, initial }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);

  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={formAction} className="space-y-6">
      {initial?.expectedUpdatedAt && (
        <input type="hidden" name="expectedUpdatedAt" value={initial.expectedUpdatedAt} />
      )}

      <div className="space-y-2">
        <Label htmlFor="title">제목</Label>
        <Input
          id="title"
          name="title"
          defaultValue={initial?.title ?? ""}
          placeholder="2026년 5월 데이터 분석 강의 제안"
          required
          maxLength={200}
        />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.join(", ")}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="clientId">고객사</Label>
        <Select name="clientId" defaultValue={initial?.clientId}>
          <SelectTrigger id="clientId">
            <SelectValue placeholder="고객사 선택" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.clientId && (
          <p className="text-sm text-destructive">{errors.clientId.join(", ")}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="proposedPeriodStart">시작일</Label>
          <Input
            id="proposedPeriodStart"
            name="proposedPeriodStart"
            type="date"
            defaultValue={initial?.proposedPeriodStart ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="proposedPeriodEnd">종료일</Label>
          <Input
            id="proposedPeriodEnd"
            name="proposedPeriodEnd"
            type="date"
            defaultValue={initial?.proposedPeriodEnd ?? ""}
          />
          {errors.proposedPeriodEnd && (
            <p className="text-sm text-destructive">
              {errors.proposedPeriodEnd.join(", ")}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="proposedBusinessAmountKrw">사업비 (원)</Label>
          <Input
            id="proposedBusinessAmountKrw"
            name="proposedBusinessAmountKrw"
            type="number"
            min="0"
            defaultValue={initial?.proposedBusinessAmountKrw ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="proposedHourlyRateKrw">시급 (원)</Label>
          <Input
            id="proposedHourlyRateKrw"
            name="proposedHourlyRateKrw"
            type="number"
            min="0"
            defaultValue={initial?.proposedHourlyRateKrw ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>필요 기술스택</Label>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => {
            const checked = initial?.requiredSkillIds?.includes(s.id) ?? false;
            return (
              <label
                key={s.id}
                className="inline-flex items-center gap-1 px-2 py-1 border rounded cursor-pointer hover:bg-muted"
              >
                <input
                  type="checkbox"
                  name="requiredSkillIds"
                  value={s.id}
                  defaultChecked={checked}
                />
                <span className="text-sm">{s.name}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">메모</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={2000}
          defaultValue={initial?.notes ?? ""}
        />
      </div>

      {errors._root && (
        <p className="text-sm text-destructive">{errors._root.join(", ")}</p>
      )}

      <div className="flex gap-2 justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중..." : mode === "create" ? "등록" : "저장"}
        </Button>
      </div>
    </form>
  );
}
