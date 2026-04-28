"use server";

// SPEC-ME-001 §2.3 REQ-ME-AI-001 ~ -009 — 이력서 AI 파싱 Server Actions.
// @MX:ANCHOR: 강사 첫 진입 핵심 경로. cache hit / Claude 호출 / fallback.
// @MX:WARN: PII pre-filter는 parseResumeText 내부에서 수행. 캐시는 SHA-256 hash UNIQUE.

import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { ensureInstructorRow } from "@/lib/instructor/me-queries";
import {
  parseResumeText,
  parsedResumeSchema,
  type ParsedResume,
  type ResumeParseResult,
} from "@/lib/instructor/resume-parser";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export interface ParseResumeActionResult {
  ok: boolean;
  message?: string;
  parsed?: ParsedResume;
  cached?: boolean;
  fileHash?: string;
}

/**
 * 업로드된 이력서 파일을 파싱한다.
 * - 파일 검증 (크기/타입)
 * - SHA-256 hash 계산
 * - ai_resume_parses 캐시 lookup → hit이면 즉시 반환
 * - miss면 텍스트 추출 + Claude 호출 + 캐시 upsert
 * - PDF/DOCX는 텍스트 추출이 제한적이므로 fallback 메시지 반환
 *   (사용자는 직접 입력 path로 안내됨)
 */
export async function parseResume(formData: FormData): Promise<ParseResumeActionResult> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return { ok: false, message: "강사 권한이 필요합니다." };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "파일이 첨부되지 않았습니다." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: "파일 크기가 10MB를 초과합니다." };
  }
  if (!ACCEPTED_TYPES.has(file.type)) {
    return { ok: false, message: "지원하지 않는 파일 형식입니다. PDF·DOCX·TXT만 업로드 가능합니다." };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(buf).digest("hex");

  const supabase = createClient(await cookies());

  // 1) 캐시 lookup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cached } = await (supabase as any)
    .from("ai_resume_parses")
    .select("parsed_json")
    .eq("input_file_hash", fileHash)
    .limit(1);
  const cachedRow = cached?.[0] as { parsed_json: unknown } | undefined;
  if (cachedRow) {
    const r = parsedResumeSchema.safeParse(cachedRow.parsed_json);
    if (r.success) {
      return { ok: true, parsed: r.data, cached: true, fileHash };
    }
    // 캐시가 깨진 경우 무시하고 재파싱
  }

  // 2) 텍스트 추출
  const text = await extractText(file, buf);
  if (!text) {
    return {
      ok: false,
      message:
        "PDF/DOCX 텍스트 추출이 어렵습니다. TXT로 변환하거나 직접 입력으로 진행해주세요.",
    };
  }

  // 3) Claude 호출
  const result: ResumeParseResult = await parseResumeText(text);
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "no_api_key"
          ? "AI 파싱이 비활성화되어 있습니다. 직접 입력으로 진행해주세요."
          : "AI 파싱에 실패했습니다. 직접 입력해주세요.",
    };
  }

  // 4) 캐시 upsert
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("ai_resume_parses")
    .upsert(
      {
        input_file_hash: fileHash,
        instructor_id: ctx.instructorId,
        parsed_json: result.parsed,
        model: result.model,
        tokens_used: result.tokensUsed,
      },
      { onConflict: "input_file_hash" },
    );

  return { ok: true, parsed: result.parsed, cached: false, fileHash };
}

async function extractText(file: File, buf: Buffer): Promise<string | null> {
  if (file.type === "text/plain") {
    return buf.toString("utf-8");
  }
  // PDF/DOCX는 외부 라이브러리(pdf-parse, mammoth) 없이 텍스트 추출이 어렵다.
  // MVP는 TXT만 지원하고 PDF/DOCX는 fallback (사용자에게 직접 입력 안내).
  return null;
}

// ---------- applyParsedResume ----------

export interface ApplyMapping {
  educations: boolean;
  workExperiences: boolean;
  teachingExperiences: boolean;
  certifications: boolean;
  publications: boolean;
  instructorProjects: boolean;
  otherActivities: boolean;
}

export interface ApplyResult {
  ok: boolean;
  message?: string;
  inserted?: Record<string, number>;
}

/**
 * AI 파싱 결과를 강사 본인의 이력서 7개 섹션에 INSERT 한다.
 * 사용자가 mapping에서 true로 체크한 섹션만 적용 (REQ-ME-AI-005).
 */
export async function applyParsedResume(
  parsed: ParsedResume,
  mapping: ApplyMapping,
): Promise<ApplyResult> {
  const ctx = await ensureInstructorRow();
  if (!ctx) return { ok: false, message: "강사 권한이 필요합니다." };

  const r = parsedResumeSchema.safeParse(parsed);
  if (!r.success) {
    return { ok: false, message: "파싱 데이터가 유효하지 않습니다." };
  }
  const data = r.data;
  const supabase = createClient(await cookies());

  const inserted: Record<string, number> = {};

  async function insertMany(table: string, rows: Record<string, unknown>[]) {
    if (rows.length === 0) {
      inserted[table] = 0;
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from(table).insert(rows);
    if (error) {
      console.error(`[applyParsedResume] insert ${table} failed`, error);
      inserted[table] = -1;
    } else {
      inserted[table] = rows.length;
    }
  }

  if (mapping.educations) {
    await insertMany(
      "educations",
      data.educations.map((e) => ({
        instructor_id: ctx.instructorId,
        school: e.school,
        major: e.major || null,
        degree: e.degree || null,
        start_date: e.startDate || null,
        end_date: e.endDate || null,
      })),
    );
  }
  if (mapping.workExperiences) {
    await insertMany(
      "work_experiences",
      data.workExperiences.map((e) => ({
        instructor_id: ctx.instructorId,
        company: e.company,
        position: e.position || null,
        start_date: e.startDate || null,
        end_date: e.endDate || null,
        description: e.description || null,
      })),
    );
  }
  if (mapping.teachingExperiences) {
    await insertMany(
      "teaching_experiences",
      data.teachingExperiences.map((e) => ({
        instructor_id: ctx.instructorId,
        title: e.title,
        organization: e.organization || null,
        start_date: e.startDate || null,
        end_date: e.endDate || null,
      })),
    );
  }
  if (mapping.certifications) {
    await insertMany(
      "certifications",
      data.certifications.map((e) => ({
        instructor_id: ctx.instructorId,
        name: e.name,
        issuer: e.issuer || null,
        issued_date: e.issuedDate || null,
      })),
    );
  }
  if (mapping.publications) {
    await insertMany(
      "publications",
      data.publications.map((e) => ({
        instructor_id: ctx.instructorId,
        title: e.title,
        publisher: e.publisher || null,
        published_date: e.publishedDate || null,
      })),
    );
  }
  if (mapping.instructorProjects) {
    await insertMany(
      "instructor_projects",
      data.projects.map((e) => ({
        instructor_id: ctx.instructorId,
        title: e.title,
        role: e.role || null,
        start_date: e.startDate || null,
        end_date: e.endDate || null,
        description: e.description || null,
      })),
    );
  }
  if (mapping.otherActivities) {
    await insertMany(
      "other_activities",
      data.otherActivities.map((e) => ({
        instructor_id: ctx.instructorId,
        title: e.title,
        category: e.category || null,
        description: e.description || null,
      })),
    );
  }

  revalidatePath("/me/resume");
  return { ok: true, inserted };
}
