// SPEC-ME-001 §2.2 REQ-ME-RESUME-PDF — PDF 생성에 필요한 평탄화된 입력 데이터.
import {
  maskEmail,
  maskPhone,
  maskAddress,
  maskResidentNumber,
} from "./resume-mask";

export interface ResumePdfBasic {
  nameKr: string;
  nameEn: string;
  nameHanja: string;
  birthDate: string;
  email: string;
  phone: string;
  address: string;
}

export interface ResumePdfRow {
  title: string;
  subtitle?: string;
  period?: string;
  description?: string;
}

export interface ResumePdfSections {
  educations: ResumePdfRow[];
  workExperiences: ResumePdfRow[];
  teachingExperiences: ResumePdfRow[];
  certifications: ResumePdfRow[];
  publications: ResumePdfRow[];
  instructorProjects: ResumePdfRow[];
  otherActivities: ResumePdfRow[];
}

export interface ResumePdfPayload {
  basic: ResumePdfBasic;
  sections: ResumePdfSections;
  generatedAt: string;
  maskPii: boolean;
}

function asStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function fmtDate(v: unknown): string {
  const s = asStr(v).trim();
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}`;
  return s;
}

function fmtPeriod(start: unknown, end: unknown): string {
  const a = fmtDate(start);
  const b = fmtDate(end);
  if (!a && !b) return "";
  if (a && !b) return `${a} ~ 재직중`;
  if (!a && b) return `~ ${b}`;
  return `${a} ~ ${b}`;
}

export function buildResumePdfSections(raw: {
  educations: Array<Record<string, unknown>>;
  workExperiences: Array<Record<string, unknown>>;
  teachingExperiences: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  publications: Array<Record<string, unknown>>;
  instructorProjects: Array<Record<string, unknown>>;
  otherActivities: Array<Record<string, unknown>>;
}): ResumePdfSections {
  return {
    educations: raw.educations.map((r) => ({
      title: asStr(r.school),
      subtitle: [asStr(r.major), asStr(r.degree)].filter(Boolean).join(" · "),
      period: fmtPeriod(r.start_date, r.end_date),
      description: asStr(r.description),
    })),
    workExperiences: raw.workExperiences.map((r) => ({
      title: asStr(r.company),
      subtitle: asStr(r.position),
      period: fmtPeriod(r.start_date, r.end_date),
      description: asStr(r.description),
    })),
    teachingExperiences: raw.teachingExperiences.map((r) => ({
      title: asStr(r.title),
      subtitle: asStr(r.organization),
      period: fmtPeriod(r.start_date, r.end_date),
      description: asStr(r.description),
    })),
    certifications: raw.certifications.map((r) => ({
      title: asStr(r.name),
      subtitle: asStr(r.issuer),
      period: [fmtDate(r.issued_date), fmtDate(r.expires_date)]
        .filter(Boolean)
        .join(" ~ "),
      description: asStr(r.description),
    })),
    publications: raw.publications.map((r) => ({
      title: asStr(r.title),
      subtitle: [asStr(r.publisher), asStr(r.isbn)].filter(Boolean).join(" · "),
      period: fmtDate(r.published_date),
      description: asStr(r.description),
    })),
    instructorProjects: raw.instructorProjects.map((r) => ({
      title: asStr(r.title),
      subtitle: asStr(r.role),
      period: fmtPeriod(r.start_date, r.end_date),
      description: asStr(r.description),
    })),
    otherActivities: raw.otherActivities.map((r) => ({
      title: asStr(r.title),
      subtitle: asStr(r.category),
      period: fmtDate(r.activity_date),
      description: asStr(r.description),
    })),
  };
}

export function maskBasicForPdf(
  basic: ResumePdfBasic,
  maskPii: boolean,
): ResumePdfBasic {
  if (!maskPii) return basic;
  return {
    ...basic,
    email: basic.email ? maskEmail(basic.email) : "",
    phone: basic.phone ? maskPhone(basic.phone) : "",
    address: basic.address ? maskAddress(basic.address) : "",
    birthDate: basic.birthDate ? `${basic.birthDate.slice(0, 4)}-**-**` : "",
  };
}

export function buildResumeFilename(
  nameKr: string,
  date: Date = new Date(),
): string {
  const safe = (nameKr || "강사").replace(/[\\/:*?"<>|\s]+/g, "_");
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `이력서_${safe}_${y}${m}${d}.pdf`;
}

export { maskEmail, maskPhone, maskAddress, maskResidentNumber };
