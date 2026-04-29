"use client";

// SPEC-ME-001 §2.2 REQ-ME-RESUME — 강사 본인 이력서 폼 (Server Action 연결).
// @MX:NOTE: 7개 섹션을 단일 form으로 처리. 각 섹션은 add/edit/delete dialog로 운영.

import * as React from "react";
import { Plus, Trash2, Save, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addEducation,
  updateEducation,
  deleteEducation,
  addWorkExperience,
  updateWorkExperience,
  deleteWorkExperience,
  addLectureHistory,
  updateLectureHistory,
  deleteLectureHistory,
  addCertification,
  updateCertification,
  deleteCertification,
  addPublication,
  updatePublication,
  deletePublication,
  addInstructorProject,
  updateInstructorProject,
  deleteInstructorProject,
  addOtherActivity,
  updateOtherActivity,
  deleteOtherActivity,
  updateBasicInfo,
} from "@/app/(app)/(instructor)/me/resume/actions";
import { toast } from "sonner";

interface BasicInfo {
  nameKr: string;
  nameHanja: string;
  nameEn: string;
  birthDate: string;
  email: string;
  phone: string;
  address: string;
}

interface Row {
  id: string;
  [key: string]: unknown;
}

interface Sections {
  educations: Row[];
  workExperiences: Row[];
  teachingExperiences: Row[];
  certifications: Row[];
  publications: Row[];
  instructorProjects: Row[];
  otherActivities: Row[];
}

export interface MeResumeFormProps {
  basicInfo: BasicInfo;
  sections: Sections;
}

export function MeResumeForm({ basicInfo, sections }: MeResumeFormProps) {
  return (
    <div className="flex flex-col gap-6">
      <BasicInfoSection initial={basicInfo} />
      <EducationSection rows={sections.educations} />
      <WorkExperienceSection rows={sections.workExperiences} />
      <TeachingExperienceSection rows={sections.teachingExperiences} />
      <CertificationSection rows={sections.certifications} />
      <PublicationSection rows={sections.publications} />
      <InstructorProjectSection rows={sections.instructorProjects} />
      <OtherActivitySection rows={sections.otherActivities} />
    </div>
  );
}

// ============== 기본정보 ==============

function BasicInfoSection({ initial }: { initial: BasicInfo }) {
  const [data, setData] = React.useState<BasicInfo>(initial);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function handleSave() {
    setErrors({});
    startTransition(async () => {
      const r = await updateBasicInfo(data);
      if (r.ok) {
        toast.success("기본정보가 저장되었습니다.");
      } else {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Card id="section-basic">
      <CardHeader>
        <CardTitle>기본정보</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="이름(한글)" required error={errors.nameKr}>
            <Input className="min-h-touch" autoComplete="name" value={data.nameKr} onChange={(e) => setData({ ...data, nameKr: e.target.value })} />
          </FormField>
          <FormField label="한자" error={errors.nameHanja}>
            <Input className="min-h-touch" value={data.nameHanja} onChange={(e) => setData({ ...data, nameHanja: e.target.value })} />
          </FormField>
          <FormField label="영문" error={errors.nameEn}>
            <Input className="min-h-touch" autoComplete="name" value={data.nameEn} onChange={(e) => setData({ ...data, nameEn: e.target.value })} />
          </FormField>
          <FormField label="생년월일" error={errors.birthDate}>
            <Input type="date" className="min-h-touch" autoComplete="bday" value={data.birthDate} onChange={(e) => setData({ ...data, birthDate: e.target.value })} />
          </FormField>
          <FormField label="이메일" error={errors.email}>
            <Input type="email" className="min-h-touch" autoComplete="email" inputMode="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} />
          </FormField>
          <FormField label="전화번호" error={errors.phone}>
            <Input type="tel" className="min-h-touch" autoComplete="tel" inputMode="tel" value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} placeholder="010-0000-0000" />
          </FormField>
        </div>
        <FormField label="주소" hint="다운로드 시 마스킹 옵션을 켜면 시/구까지만 노출됩니다." error={errors.address}>
          <Input className="min-h-touch" autoComplete="street-address" value={data.address} onChange={(e) => setData({ ...data, address: e.target.value })} />
        </FormField>
        <div>
          <Button type="button" onClick={handleSave} disabled={pending} className="w-full sm:w-auto min-h-touch">
            <Save /> {pending ? "저장 중..." : "기본정보 저장"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============== 공통 utils ==============

function FormField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const errId = error ? `err-${label}` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label required={required}>{label}</Label>
      {children}
      {hint && <p className="text-sm md:text-xs text-[var(--color-text-subtle)]">{hint}</p>}
      {error && <p id={errId} role="alert" className="text-sm md:text-xs text-[var(--color-state-alert)]">{error}</p>}
    </div>
  );
}

// 공통 섹션 렌더러 (header + rows)
function SectionShell({
  id,
  title,
  rows,
  renderRowSummary,
  EditDialog,
  AddDialog,
  onDelete,
}: {
  id: string;
  title: string;
  rows: Row[];
  renderRowSummary: (row: Row) => React.ReactNode;
  EditDialog: React.ComponentType<{ row: Row; onClose: () => void }>;
  AddDialog: React.ComponentType<{ onClose: () => void }>;
  onDelete: (id: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [editId, setEditId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [, startTransition] = React.useTransition();

  function handleDelete(rowId: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    startTransition(async () => {
      const r = await onDelete(rowId);
      if (r.ok) toast.success("삭제되었습니다.");
      else toast.error(r.message ?? "삭제에 실패했습니다.");
    });
  }

  const editingRow = editId ? rows.find((r) => r.id === editId) : null;

  return (
    <Card id={`section-${id}`}>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <CardTitle>{title}</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)} className="w-full sm:w-auto min-h-touch">
          <Plus /> 추가
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-3">등록된 항목이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex-1 min-w-0">{renderRowSummary(r)}</div>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditId(r.id)} aria-label="수정">
                    <Pencil />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleDelete(r.id)} aria-label="삭제">
                    <Trash2 className="text-[var(--color-state-alert)]" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {adding && <AddDialog onClose={() => setAdding(false)} />}
      {editingRow && <EditDialog row={editingRow} onClose={() => setEditId(null)} />}
    </Card>
  );
}

// 모달 오버레이 (간단)
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-lg bg-[var(--color-surface)] p-5 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ============== 학력 ==============

function EducationSection({ rows }: { rows: Row[] }) {
  return (
    <SectionShell
      id="education"
      title="학력"
      rows={rows}
      renderRowSummary={(r) => (
        <div className="text-sm">
          <span className="font-medium">{String(r.school ?? "")}</span>
          {r.major ? <span className="text-[var(--color-text-muted)]"> · {String(r.major)}</span> : null}
          {r.degree ? <span className="text-[var(--color-text-subtle)]"> ({String(r.degree)})</span> : null}
          <p className="text-sm md:text-xs text-[var(--color-text-subtle)] mt-0.5">
            {String(r.start_date ?? "")} ~ {String(r.end_date ?? "재학중")}
          </p>
        </div>
      )}
      AddDialog={({ onClose }) => <EducationDialog mode="add" onClose={onClose} />}
      EditDialog={({ row, onClose }) => <EducationDialog mode="edit" row={row} onClose={onClose} />}
      onDelete={async (id) => deleteEducation(id)}
    />
  );
}

function EducationDialog({ mode, row, onClose }: { mode: "add" | "edit"; row?: Row; onClose: () => void }) {
  const [form, setForm] = React.useState({
    school: String(row?.school ?? ""),
    major: String(row?.major ?? ""),
    degree: String(row?.degree ?? ""),
    startDate: String(row?.start_date ?? ""),
    endDate: String(row?.end_date ?? ""),
    description: String(row?.description ?? ""),
  });
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const action = mode === "add" ? addEducation : (input: typeof form) => updateEducation(row!.id, input);
      const r = await action(form);
      if (r.ok) {
        toast.success(mode === "add" ? "추가되었습니다." : "수정되었습니다.");
        onClose();
      } else {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Modal title={mode === "add" ? "학력 추가" : "학력 수정"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="학교명" required error={errors.school}>
          <Input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} required />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="전공" error={errors.major}>
            <Input value={form.major} onChange={(e) => setForm({ ...form, major: e.target.value })} />
          </FormField>
          <FormField label="학위" error={errors.degree}>
            <Input value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })} placeholder="학사/석사/박사" />
          </FormField>
          <FormField label="시작" error={errors.startDate}>
            <Input type="month" value={form.startDate.slice(0, 7)} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </FormField>
          <FormField label="종료" error={errors.endDate}>
            <Input type="month" value={form.endDate.slice(0, 7)} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </FormField>
        </div>
        <FormField label="설명" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </FormField>
        <DialogActions onClose={onClose} pending={pending} />
      </form>
    </Modal>
  );
}

// ============== 경력 ==============

function WorkExperienceSection({ rows }: { rows: Row[] }) {
  return (
    <SectionShell
      id="work"
      title="경력"
      rows={rows}
      renderRowSummary={(r) => (
        <div className="text-sm">
          <span className="font-medium">{String(r.company ?? "")}</span>
          {r.position ? <span className="text-[var(--color-text-muted)]"> · {String(r.position)}</span> : null}
          <p className="text-sm md:text-xs text-[var(--color-text-subtle)] mt-0.5">
            {String(r.start_date ?? "")} ~ {String(r.end_date ?? "재직중")}
          </p>
        </div>
      )}
      AddDialog={({ onClose }) => <WorkDialog mode="add" onClose={onClose} />}
      EditDialog={({ row, onClose }) => <WorkDialog mode="edit" row={row} onClose={onClose} />}
      onDelete={async (id) => deleteWorkExperience(id)}
    />
  );
}

function WorkDialog({ mode, row, onClose }: { mode: "add" | "edit"; row?: Row; onClose: () => void }) {
  const [form, setForm] = React.useState({
    company: String(row?.company ?? ""),
    position: String(row?.position ?? ""),
    startDate: String(row?.start_date ?? ""),
    endDate: String(row?.end_date ?? ""),
    description: String(row?.description ?? ""),
  });
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const action = mode === "add" ? addWorkExperience : (input: typeof form) => updateWorkExperience(row!.id, input);
      const r = await action(form);
      if (r.ok) {
        toast.success(mode === "add" ? "추가되었습니다." : "수정되었습니다.");
        onClose();
      } else {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Modal title={mode === "add" ? "경력 추가" : "경력 수정"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="회사명" required error={errors.company}>
          <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="직위" error={errors.position}>
            <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
          </FormField>
          <div />
          <FormField label="시작" error={errors.startDate}>
            <Input type="month" value={form.startDate.slice(0, 7)} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </FormField>
          <FormField label="종료" error={errors.endDate}>
            <Input type="month" value={form.endDate.slice(0, 7)} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </FormField>
        </div>
        <FormField label="담당업무" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </FormField>
        <DialogActions onClose={onClose} pending={pending} />
      </form>
    </Modal>
  );
}

// ============== 강의이력 ==============

function TeachingExperienceSection({ rows }: { rows: Row[] }) {
  return (
    <SectionShell
      id="teaching"
      title="강의이력"
      rows={rows}
      renderRowSummary={(r) => (
        <div className="text-sm">
          <span className="font-medium">{String(r.title ?? "")}</span>
          {r.organization ? <span className="text-[var(--color-text-muted)]"> · {String(r.organization)}</span> : null}
          <p className="text-sm md:text-xs text-[var(--color-text-subtle)] mt-0.5">
            {String(r.start_date ?? "")} ~ {String(r.end_date ?? "")}
          </p>
        </div>
      )}
      AddDialog={({ onClose }) => <TeachingDialog mode="add" onClose={onClose} />}
      EditDialog={({ row, onClose }) => <TeachingDialog mode="edit" row={row} onClose={onClose} />}
      onDelete={async (id) => deleteLectureHistory(id)}
    />
  );
}

function TeachingDialog({ mode, row, onClose }: { mode: "add" | "edit"; row?: Row; onClose: () => void }) {
  const [form, setForm] = React.useState({
    title: String(row?.title ?? ""),
    organization: String(row?.organization ?? ""),
    startDate: String(row?.start_date ?? ""),
    endDate: String(row?.end_date ?? ""),
    description: String(row?.description ?? ""),
  });
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const action = mode === "add" ? addLectureHistory : (input: typeof form) => updateLectureHistory(row!.id, input);
      const r = await action(form);
      if (r.ok) {
        toast.success(mode === "add" ? "추가되었습니다." : "수정되었습니다.");
        onClose();
      } else {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Modal title={mode === "add" ? "강의이력 추가" : "강의이력 수정"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="강의명" required error={errors.title}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </FormField>
        <FormField label="발주처/기관" error={errors.organization}>
          <Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="시작" error={errors.startDate}>
            <Input type="month" value={form.startDate.slice(0, 7)} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </FormField>
          <FormField label="종료" error={errors.endDate}>
            <Input type="month" value={form.endDate.slice(0, 7)} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </FormField>
        </div>
        <FormField label="설명" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </FormField>
        <DialogActions onClose={onClose} pending={pending} />
      </form>
    </Modal>
  );
}

// ============== 자격 ==============

function CertificationSection({ rows }: { rows: Row[] }) {
  return (
    <SectionShell
      id="cert"
      title="자격"
      rows={rows}
      renderRowSummary={(r) => (
        <div className="text-sm">
          <span className="font-medium">{String(r.name ?? "")}</span>
          {r.issuer ? <span className="text-[var(--color-text-muted)]"> · {String(r.issuer)}</span> : null}
          <p className="text-sm md:text-xs text-[var(--color-text-subtle)] mt-0.5">{String(r.issued_date ?? "")}</p>
        </div>
      )}
      AddDialog={({ onClose }) => <CertDialog mode="add" onClose={onClose} />}
      EditDialog={({ row, onClose }) => <CertDialog mode="edit" row={row} onClose={onClose} />}
      onDelete={async (id) => deleteCertification(id)}
    />
  );
}

function CertDialog({ mode, row, onClose }: { mode: "add" | "edit"; row?: Row; onClose: () => void }) {
  const [form, setForm] = React.useState({
    name: String(row?.name ?? ""),
    issuer: String(row?.issuer ?? ""),
    issuedDate: String(row?.issued_date ?? ""),
    expiresDate: String(row?.expires_date ?? ""),
    description: String(row?.description ?? ""),
  });
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const action = mode === "add" ? addCertification : (input: typeof form) => updateCertification(row!.id, input);
      const r = await action(form);
      if (r.ok) {
        toast.success(mode === "add" ? "추가되었습니다." : "수정되었습니다.");
        onClose();
      } else {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Modal title={mode === "add" ? "자격 추가" : "자격 수정"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="자격증명" required error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </FormField>
        <FormField label="발급기관" error={errors.issuer}>
          <Input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="취득일" error={errors.issuedDate}>
            <Input type="date" value={form.issuedDate} onChange={(e) => setForm({ ...form, issuedDate: e.target.value })} />
          </FormField>
          <FormField label="만료일" error={errors.expiresDate}>
            <Input type="date" value={form.expiresDate} onChange={(e) => setForm({ ...form, expiresDate: e.target.value })} />
          </FormField>
        </div>
        <FormField label="설명" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </FormField>
        <DialogActions onClose={onClose} pending={pending} />
      </form>
    </Modal>
  );
}

// ============== 저서 ==============

function PublicationSection({ rows }: { rows: Row[] }) {
  return (
    <SectionShell
      id="publication"
      title="저서"
      rows={rows}
      renderRowSummary={(r) => (
        <div className="text-sm">
          <span className="font-medium">{String(r.title ?? "")}</span>
          {r.publisher ? <span className="text-[var(--color-text-muted)]"> · {String(r.publisher)}</span> : null}
          <p className="text-sm md:text-xs text-[var(--color-text-subtle)] mt-0.5">{String(r.published_date ?? "")}</p>
        </div>
      )}
      AddDialog={({ onClose }) => <PubDialog mode="add" onClose={onClose} />}
      EditDialog={({ row, onClose }) => <PubDialog mode="edit" row={row} onClose={onClose} />}
      onDelete={async (id) => deletePublication(id)}
    />
  );
}

function PubDialog({ mode, row, onClose }: { mode: "add" | "edit"; row?: Row; onClose: () => void }) {
  const [form, setForm] = React.useState({
    title: String(row?.title ?? ""),
    publisher: String(row?.publisher ?? ""),
    publishedDate: String(row?.published_date ?? ""),
    isbn: String(row?.isbn ?? ""),
    description: String(row?.description ?? ""),
  });
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const action = mode === "add" ? addPublication : (input: typeof form) => updatePublication(row!.id, input);
      const r = await action(form);
      if (r.ok) {
        toast.success(mode === "add" ? "추가되었습니다." : "수정되었습니다.");
        onClose();
      } else {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Modal title={mode === "add" ? "저서 추가" : "저서 수정"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="도서명" required error={errors.title}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </FormField>
        <FormField label="출판사" error={errors.publisher}>
          <Input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="발행일" error={errors.publishedDate}>
            <Input type="date" value={form.publishedDate} onChange={(e) => setForm({ ...form, publishedDate: e.target.value })} />
          </FormField>
          <FormField label="ISBN" error={errors.isbn}>
            <Input value={form.isbn} onChange={(e) => setForm({ ...form, isbn: e.target.value })} />
          </FormField>
        </div>
        <FormField label="설명" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </FormField>
        <DialogActions onClose={onClose} pending={pending} />
      </form>
    </Modal>
  );
}

// ============== 프로젝트 ==============

function InstructorProjectSection({ rows }: { rows: Row[] }) {
  return (
    <SectionShell
      id="proj"
      title="프로젝트"
      rows={rows}
      renderRowSummary={(r) => (
        <div className="text-sm">
          <span className="font-medium">{String(r.title ?? "")}</span>
          {r.role ? <span className="text-[var(--color-text-muted)]"> · {String(r.role)}</span> : null}
          <p className="text-sm md:text-xs text-[var(--color-text-subtle)] mt-0.5">
            {String(r.start_date ?? "")} ~ {String(r.end_date ?? "")}
          </p>
        </div>
      )}
      AddDialog={({ onClose }) => <ProjDialog mode="add" onClose={onClose} />}
      EditDialog={({ row, onClose }) => <ProjDialog mode="edit" row={row} onClose={onClose} />}
      onDelete={async (id) => deleteInstructorProject(id)}
    />
  );
}

function ProjDialog({ mode, row, onClose }: { mode: "add" | "edit"; row?: Row; onClose: () => void }) {
  const [form, setForm] = React.useState({
    title: String(row?.title ?? ""),
    role: String(row?.role ?? ""),
    startDate: String(row?.start_date ?? ""),
    endDate: String(row?.end_date ?? ""),
    description: String(row?.description ?? ""),
  });
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const action = mode === "add" ? addInstructorProject : (input: typeof form) => updateInstructorProject(row!.id, input);
      const r = await action(form);
      if (r.ok) {
        toast.success(mode === "add" ? "추가되었습니다." : "수정되었습니다.");
        onClose();
      } else {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Modal title={mode === "add" ? "프로젝트 추가" : "프로젝트 수정"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="프로젝트명" required error={errors.title}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </FormField>
        <FormField label="역할" error={errors.role}>
          <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FormField label="시작" error={errors.startDate}>
            <Input type="month" value={form.startDate.slice(0, 7)} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </FormField>
          <FormField label="종료" error={errors.endDate}>
            <Input type="month" value={form.endDate.slice(0, 7)} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </FormField>
        </div>
        <FormField label="설명" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </FormField>
        <DialogActions onClose={onClose} pending={pending} />
      </form>
    </Modal>
  );
}

// ============== 기타 활동 ==============

function OtherActivitySection({ rows }: { rows: Row[] }) {
  return (
    <SectionShell
      id="other"
      title="기타활동"
      rows={rows}
      renderRowSummary={(r) => (
        <div className="text-sm">
          <span className="font-medium">{String(r.title ?? "")}</span>
          {r.category ? <span className="text-[var(--color-text-muted)]"> · {String(r.category)}</span> : null}
          <p className="text-sm md:text-xs text-[var(--color-text-subtle)] mt-0.5">{String(r.activity_date ?? "")}</p>
        </div>
      )}
      AddDialog={({ onClose }) => <OtherDialog mode="add" onClose={onClose} />}
      EditDialog={({ row, onClose }) => <OtherDialog mode="edit" row={row} onClose={onClose} />}
      onDelete={async (id) => deleteOtherActivity(id)}
    />
  );
}

function OtherDialog({ mode, row, onClose }: { mode: "add" | "edit"; row?: Row; onClose: () => void }) {
  const [form, setForm] = React.useState({
    title: String(row?.title ?? ""),
    category: String(row?.category ?? ""),
    activityDate: String(row?.activity_date ?? ""),
    description: String(row?.description ?? ""),
  });
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    startTransition(async () => {
      const action = mode === "add" ? addOtherActivity : (input: typeof form) => updateOtherActivity(row!.id, input);
      const r = await action(form);
      if (r.ok) {
        toast.success(mode === "add" ? "추가되었습니다." : "수정되었습니다.");
        onClose();
      } else {
        if (r.fieldErrors) setErrors(r.fieldErrors);
        toast.error(r.message ?? "저장에 실패했습니다.");
      }
    });
  }

  return (
    <Modal title={mode === "add" ? "기타활동 추가" : "기타활동 수정"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <FormField label="활동명" required error={errors.title}>
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </FormField>
        <FormField label="카테고리" error={errors.category}>
          <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="수상/세미나/봉사 등" />
        </FormField>
        <FormField label="활동일" error={errors.activityDate}>
          <Input type="date" value={form.activityDate} onChange={(e) => setForm({ ...form, activityDate: e.target.value })} />
        </FormField>
        <FormField label="설명" error={errors.description}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
        </FormField>
        <DialogActions onClose={onClose} pending={pending} />
      </form>
    </Modal>
  );
}

// ============== 공통 ==============

function DialogActions({ onClose, pending }: { onClose: () => void; pending: boolean }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onClose} disabled={pending} className="w-full sm:w-auto min-h-touch">
        취소
      </Button>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto min-h-touch">
        <Save /> {pending ? "저장 중..." : "저장"}
      </Button>
    </div>
  );
}
