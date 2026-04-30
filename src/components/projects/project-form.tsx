"use client";

import * as React from "react";
import { Sparkles, Save, X, Search } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type ProjectStatus, statusBadgeVariant } from "@/lib/projects";
import { formatKRW } from "@/lib/utils";

interface ProjectFormProps {
  clients: { id: string; name: string }[];
  instructors: { id: string; name: string }[];
}

const STATUS_OPTIONS: ProjectStatus[] = [
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

export function ProjectForm({ clients, instructors }: ProjectFormProps) {
  const [businessAmount, setBusinessAmount] = React.useState(0);
  const [instructorFee, setInstructorFee] = React.useState(0);
  const [status, setStatus] = React.useState<ProjectStatus>("proposal");
  const margin = businessAmount - instructorFee;

  return (
    <form className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      {/* 메인 폼 */}
      <div className="flex flex-col gap-4 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="사업명" required>
              <Input name="businessName" placeholder="예: KDT AI 부트캠프 8회차" />
            </Field>
            <Field label="과정명" required>
              <Input name="courseName" placeholder="예: 생성형 AI 활용 실무" />
            </Field>
            <Field label="고객사" required>
              <ComboField
                name="clientId"
                placeholder="고객사 선택 또는 검색"
                options={clients}
              />
            </Field>
            <Field label="알고링크 담당자">
              <Input name="operatorName" placeholder="담당자 이름" />
            </Field>
            <Field label="교육 시작일">
              <Input name="educationStart" type="date" />
            </Field>
            <Field label="교육 종료일">
              <Input name="educationEnd" type="date" />
            </Field>
            <Field label="시수" hint="자동 계산도 가능">
              <Input name="totalHours" type="number" placeholder="80" inputMode="numeric" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>강사 · 금액</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="배정 강사" hint="비워두면 추후 AI 추천 후 배정">
              <ComboField
                name="instructorId"
                placeholder="강사 선택 또는 검색"
                options={instructors}
                action={
                  <Button variant="outline" size="sm" type="button">
                    <Sparkles className="h-3.5 w-3.5" /> AI 추천
                  </Button>
                }
              />
            </Field>
            <Field label="진행 상황">
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="사업비 (원)" required>
              <Input
                name="businessAmount"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={businessAmount || ""}
                onChange={(e) => setBusinessAmount(Number(e.target.value) || 0)}
                className="font-tabular text-right"
              />
            </Field>
            <Field label="강사비 (원)">
              <Input
                name="instructorFee"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={instructorFee || ""}
                onChange={(e) => setInstructorFee(Number(e.target.value) || 0)}
                className="font-tabular text-right"
              />
            </Field>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between rounded-md bg-[var(--color-neutral-100)] dark:bg-[var(--color-neutral-800)] p-3">
                <span className="text-sm text-[var(--color-text-muted)]">예상 마진 (자동 계산)</span>
                <span
                  className={`text-lg font-bold font-tabular ${
                    margin >= 0 ? "text-[var(--color-state-settled)]" : "text-[var(--color-state-alert)]"
                  }`}
                >
                  {formatKRW(margin, { sign: true })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>메모</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="instructor">
              <TabsList>
                <TabsTrigger value="instructor">강사 공유 메모</TabsTrigger>
                <TabsTrigger value="internal">내부 메모</TabsTrigger>
              </TabsList>
              <TabsContent value="instructor">
                <Textarea
                  name="instructorNote"
                  placeholder="강사님께 전달할 내용 — 마크다운, 링크 임베딩 가능"
                  rows={5}
                />
              </TabsContent>
              <TabsContent value="internal">
                <Textarea
                  name="internalNote"
                  placeholder="내부 진행 상황·인수인계용 메모"
                  rows={5}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* 사이드 — 진행 상태 + AI 이메일 초안 */}
      <aside className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">현재 상태</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={statusBadgeVariant(status)} className="text-sm py-1 px-2.5">
              {STATUS_LABELS[status]}
            </Badge>
            <p className="text-xs text-[var(--color-text-muted)] mt-3">
              상태가 변경되면 자동으로 이력에 기록됩니다.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--color-primary)]" /> AI 이메일 초안
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              입력한 내용을 바탕으로 강사·고객사에게 보낼 이메일 초안을 생성해 드릴게요.
            </p>
            <Button type="button" variant="outline" size="sm" className="w-full">
              <Sparkles className="h-3.5 w-3.5" /> 초안 생성
            </Button>
            <Textarea
              placeholder="여기에 생성된 초안이 표시됩니다."
              rows={6}
              readOnly
              className="text-xs"
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sticky bottom-4">
          <Button type="submit" size="lg">
            <Save /> 저장
          </Button>
          <Button type="button" variant="outline">
            <Sparkles className="h-4 w-4" /> 저장 후 강사 추천
          </Button>
          <Button type="button" variant="ghost">
            <X /> 취소
          </Button>
        </div>
      </aside>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-[var(--color-text-subtle)]">{hint}</p>}
    </div>
  );
}

function ComboField({
  name,
  placeholder,
  options,
  action,
}: {
  name: string;
  placeholder: string;
  options: { id: string; name: string }[];
  action?: React.ReactNode;
}) {
  return (
    <div className="flex gap-1.5">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-subtle)]" />
        <Input
          name={name}
          placeholder={placeholder}
          list={`${name}-options`}
          className="pl-8"
        />
        <datalist id={`${name}-options`}>
          {options.map((o) => (
            <option key={o.id} value={o.name} />
          ))}
        </datalist>
      </div>
      {action}
    </div>
  );
}
