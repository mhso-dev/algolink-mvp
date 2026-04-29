"use client";

// @MX:SPEC: SPEC-SKILL-ABSTRACT-001 — proficiency 입력 제거. 9개 추상 카테고리 chip 다중선택.
// 정적 데모/템플릿 — 실제 /me/resume 페이지는 me-resume-form.tsx + me-skills-picker-section.tsx 사용.

import * as React from "react";
import { Plus, Upload, Download, Eye, EyeOff, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

const SECTIONS = [
  { id: "basic", label: "기본사항" },
  { id: "education", label: "학력" },
  { id: "certification", label: "자격" },
  { id: "career", label: "현업경력" },
  { id: "lecture", label: "강의경력" },
  { id: "project", label: "프로젝트" },
  { id: "etc", label: "기타활동" },
  { id: "publication", label: "저서" },
  { id: "skills", label: "강의가능분야" },
] as const;

// SPEC-SKILL-ABSTRACT-001 — 9개 추상 카테고리.
const SKILL_CATEGORIES = [
  "프로그래밍",
  "운영체제·인프라",
  "프론트엔드",
  "백엔드",
  "모바일",
  "데이터·AI",
  "보안",
  "자동화·도구",
  "산업 도메인",
];

export function ResumeForm() {
  const [activeSection, setActiveSection] = React.useState<string>("basic");
  const [maskOnDownload, setMaskOnDownload] = React.useState(true);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
      {/* 좌측 섹션 네비 */}
      <aside className="lg:sticky lg:top-4 self-start">
        <nav aria-label="이력서 섹션">
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection(s.id);
                    document
                      .getElementById(`section-${s.id}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                    activeSection === s.id
                      ? "bg-[var(--color-primary-muted)] text-[var(--color-primary-muted-foreground)] font-medium"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text)]"
                  }`}
                  aria-current={activeSection === s.id ? "true" : undefined}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* 메인 폼 */}
      <form className="flex flex-col gap-6 min-w-0">
        {/* AI 자동 채움 */}
        <Card className="border-dashed border-2">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div className="flex-1">
              <p className="font-medium text-sm">기존 이력서가 있으신가요?</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                PDF·DOCX·TXT 파일을 업로드하면 AI가 양식을 자동으로 채워드립니다.
              </p>
            </div>
            <Button type="button" variant="outline">
              <Upload /> 파일 업로드
            </Button>
          </CardContent>
        </Card>

        {/* 기본사항 */}
        <Section id="basic" title="기본사항">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="이름 (한글)" required>
              <Input name="nameKr" className="min-h-touch" autoComplete="name" />
            </Field>
            <Field label="한자">
              <Input name="nameHanja" className="min-h-touch" />
            </Field>
            <Field label="영문">
              <Input name="nameEn" className="min-h-touch" autoComplete="name" />
            </Field>
            <Field label="생년월일">
              <Input type="date" name="birthDate" className="min-h-touch" autoComplete="bday" />
            </Field>
            <Field label="이메일" required>
              <Input type="email" name="email" className="min-h-touch" autoComplete="email" inputMode="email" />
            </Field>
            <Field label="전화번호">
              <Input type="tel" name="phone" className="min-h-touch" autoComplete="tel" inputMode="tel" placeholder="010-0000-0000" />
            </Field>
          </div>
          <Field label="주소" hint="다운로드 시 마스킹 옵션을 켜면 제외됩니다.">
            <Input name="address" className="min-h-touch" autoComplete="street-address" />
          </Field>
        </Section>

        {/* 학력 */}
        <RepeatableSection
          id="education"
          title="학력"
          columns={["입학년월", "졸업년월", "대학명", "학과", "학위"]}
          inputTypes={["month", "month", "text", "text", "text"]}
        />

        {/* 자격 */}
        <RepeatableSection
          id="certification"
          title="자격"
          columns={["취득일자", "자격명", "발급기관"]}
          inputTypes={["date", "text", "text"]}
        />

        {/* 현업경력 */}
        <RepeatableSection
          id="career"
          title="현업경력"
          columns={["입사년월", "퇴사년월", "회사명", "직위", "담당업무"]}
          inputTypes={["month", "month", "text", "text", "text"]}
        />

        {/* 강의경력 */}
        <RepeatableSection
          id="lecture"
          title="강의경력"
          columns={["시작년월", "종료년월", "과정명", "고객사", "주요기술", "만족도"]}
          inputTypes={["month", "month", "text", "text", "text", "text"]}
          extraNote="알고링크에서 진행한 과정은 자동 추가됩니다. 성과(만족도) 클릭 시 상세 결과를 확인할 수 있어요."
        />

        {/* 프로젝트 */}
        <RepeatableSection
          id="project"
          title="프로젝트"
          columns={["시작년월", "종료년월", "내용", "발주처", "성과"]}
          inputTypes={["month", "month", "text", "text", "text"]}
        />

        {/* 기타활동 */}
        <RepeatableSection
          id="etc"
          title="기타활동"
          columns={["시작년월", "종료년월", "내용", "발주처"]}
          inputTypes={["month", "month", "text", "text"]}
        />

        {/* 저서 */}
        <RepeatableSection
          id="publication"
          title="저서"
          columns={["발행년월", "도서명", "출판사"]}
          inputTypes={["month", "text", "text"]}
        />

        {/* 강의가능분야 — SPEC-SKILL-ABSTRACT-001: 9개 chip 다중선택, proficiency 부재. */}
        <Section id="skills" title="강의가능분야">
          <p className="text-xs text-[var(--color-text-muted)] -mt-1">
            보유한 카테고리만 선택하세요. 난이도/세부 기술 입력은 사용하지 않습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            {SKILL_CATEGORIES.map((cat) => (
              <label
                key={cat}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[var(--color-border)] text-sm cursor-pointer"
              >
                <Checkbox id={`skill-${cat}`} className="sr-only" />
                <span>{cat}</span>
              </label>
            ))}
          </div>
          <Field label="강의력·성향·소프트스킬" hint="자유 텍스트 — 강의 스타일을 알릴 수 있는 정보">
            <Textarea rows={4} placeholder="예: 실습 위주의 단계적 진행, 입문자 친화적, 산업 사례 풍부" />
          </Field>
        </Section>

        {/* 첨부자료 */}
        <Section id="attachments" title="첨부자료">
          <div className="rounded-md border-2 border-dashed border-[var(--color-border-strong)] p-6 text-center">
            <Upload className="h-6 w-6 mx-auto mb-2 text-[var(--color-text-subtle)]" />
            <p className="text-sm font-medium">파일을 드래그하거나 클릭해 업로드</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              보수교육 이수증·경력증빙 등 (PDF, JPG, PNG · 최대 10MB)
            </p>
          </div>
        </Section>

        {/* 다운로드 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">이력서 다운로드</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={maskOnDownload}
                onCheckedChange={(c) => setMaskOnDownload(c === true)}
              />
              주소·전화번호·주민번호 마스킹 (개인정보 보호)
              {maskOnDownload ? (
                <EyeOff className="h-3.5 w-3.5 text-[var(--color-state-info)]" />
              ) : (
                <Eye className="h-3.5 w-3.5 text-[var(--color-state-pending)]" />
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-touch">
                <Download /> PDF
              </Button>
              <Button type="button" variant="outline" disabled className="min-h-touch">
                <Download /> Word (준비 중)
              </Button>
              <Button type="button" variant="outline" disabled className="min-h-touch">
                <Download /> 한글 (준비 중)
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={`section-${id}`} className="scroll-mt-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
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

function RepeatableSection({
  id,
  title,
  columns,
  inputTypes,
  extraNote,
}: {
  id: string;
  title: string;
  columns: string[];
  inputTypes: string[];
  extraNote?: string;
}) {
  const [rows, setRows] = React.useState<number[]>([0]);

  return (
    <Section id={id} title={title}>
      {extraNote && (
        <p className="text-xs text-[var(--color-text-muted)] -mt-2">{extraNote}</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {columns.map((c) => (
                <th
                  key={c}
                  className="text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] px-2 py-2"
                >
                  {c}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((rowId) => (
              <tr key={rowId} className="border-b border-[var(--color-border)]">
                {columns.map((_, ci) => (
                  <td key={ci} className="px-2 py-2">
                    <Input type={inputTypes[ci]} className="h-8 text-sm" />
                  </td>
                ))}
                <td className="px-2 py-2 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setRows((r) => r.filter((id) => id !== rowId))}
                    aria-label="행 삭제"
                  >
                    <Trash2 className="text-[var(--color-state-alert)]" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setRows((r) => [...r, Math.max(...r, 0) + 1])}
      >
        <Plus /> 행 추가
      </Button>
    </Section>
  );
}
