// SPEC-ME-001 §2.3 REQ-ME-AI-003/005/006/007 — 이력서 AI 파싱.
// @MX:ANCHOR: AI 응답 → ParsedResume 구조화 + zod 검증 + 폴백 진입점.
// @MX:REASON: 강사 첫 진입 핵심 경로. fallback 정확도가 사용자 신뢰의 1차 지표.
// @MX:WARN: PII pre-filter 적용 후 외부 API에 전송. 누락 시 개인정보 외부 유출.

import { z } from "zod";
import { callClaude, ClaudeError } from "@/lib/ai/claude";

// ---------- Parsed JSON schema ----------

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, "YYYY-MM 또는 YYYY-MM-DD 형식만 허용")
  .or(z.literal(""))
  .nullable()
  .optional();

const educationItem = z.object({
  school: z.string().min(1),
  major: z.string().nullable().optional(),
  degree: z.string().nullable().optional(),
  startDate: dateString,
  endDate: dateString,
});

const workExperienceItem = z.object({
  company: z.string().min(1),
  position: z.string().nullable().optional(),
  startDate: dateString,
  endDate: dateString,
  description: z.string().nullable().optional(),
});

const teachingExperienceItem = z.object({
  title: z.string().min(1),
  organization: z.string().nullable().optional(),
  startDate: dateString,
  endDate: dateString,
});

const certificationItem = z.object({
  name: z.string().min(1),
  issuer: z.string().nullable().optional(),
  issuedDate: dateString,
});

const publicationItem = z.object({
  title: z.string().min(1),
  publisher: z.string().nullable().optional(),
  publishedDate: dateString,
});

const projectItem = z.object({
  title: z.string().min(1),
  role: z.string().nullable().optional(),
  startDate: dateString,
  endDate: dateString,
  description: z.string().nullable().optional(),
});

const otherActivityItem = z.object({
  title: z.string().min(1),
  category: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const parsedResumeSchema = z.object({
  educations: z.array(educationItem).default([]),
  workExperiences: z.array(workExperienceItem).default([]),
  teachingExperiences: z.array(teachingExperienceItem).default([]),
  certifications: z.array(certificationItem).default([]),
  publications: z.array(publicationItem).default([]),
  projects: z.array(projectItem).default([]),
  otherActivities: z.array(otherActivityItem).default([]),
});

export type ParsedResume = z.infer<typeof parsedResumeSchema>;

// ---------- PII pre-filter (REQ-ME-AI-007) ----------

/**
 * 이력서 텍스트에서 주민등록번호/계좌번호/사업자등록번호 패턴을 제거.
 * Claude 외부 전송 전 반드시 호출.
 */
export function stripPii(text: string): string {
  return text
    // 주민등록번호 (000000-0000000)
    .replace(/\d{6}-?\d{7}/g, "[REDACTED_RRN]")
    // 사업자등록번호 (000-00-00000)
    .replace(/\d{3}-?\d{2}-?\d{5}/g, "[REDACTED_BRN]")
    // 계좌번호 후보 (8~16자리 연속 숫자, dash 허용)
    .replace(/\b\d{2,4}[-]\d{2,6}[-]\d{2,7}\b/g, "[REDACTED_ACCT]");
}

// ---------- 시스템 프롬프트 ----------

const SYSTEM_PROMPT = `당신은 한국어 이력서를 구조화된 JSON으로 변환하는 전문 파서입니다.
입력은 PDF/DOCX/TXT에서 추출된 이력서 텍스트이며, 개인 식별 번호(주민/사업자/계좌)는 사전에 제거되어 있습니다.

다음 JSON 스키마에 정확히 맞춰 응답하세요. 다른 설명/마크다운 코드 펜스 없이 JSON 객체만 반환하세요.

{
  "educations": [{ "school": string, "major": string | null, "degree": string | null, "startDate": "YYYY-MM" | null, "endDate": "YYYY-MM" | null }],
  "workExperiences": [{ "company": string, "position": string | null, "startDate": "YYYY-MM" | null, "endDate": "YYYY-MM" | null, "description": string | null }],
  "teachingExperiences": [{ "title": string, "organization": string | null, "startDate": "YYYY-MM" | null, "endDate": "YYYY-MM" | null }],
  "certifications": [{ "name": string, "issuer": string | null, "issuedDate": "YYYY-MM-DD" | null }],
  "publications": [{ "title": string, "publisher": string | null, "publishedDate": "YYYY-MM-DD" | null }],
  "projects": [{ "title": string, "role": string | null, "startDate": "YYYY-MM" | null, "endDate": "YYYY-MM" | null, "description": string | null }],
  "otherActivities": [{ "title": string, "category": string | null, "description": string | null }]
}

규칙:
- 각 배열은 빈 배열로 시작하며, 발견된 항목만 추가.
- 알 수 없는 날짜는 null. 추측 금지.
- description은 1-2 문장 이내로 요약.
- 모든 텍스트는 한국어 원본 유지.`;

// ---------- 메인 파싱 함수 ----------

export type ResumeParseResult =
  | { ok: true; parsed: ParsedResume; model: string; tokensUsed: number }
  | { ok: false; reason: ResumeParseFailureReason; message: string };

export type ResumeParseFailureReason =
  | "no_api_key"
  | "api_error"
  | "schema_invalid"
  | "empty_input";

/**
 * 이력서 텍스트 → ParsedResume.
 *
 * 실패 시 throw하지 않고 `{ ok: false, reason }` 반환 — 호출자가 fallback UI 표시.
 */
export async function parseResumeText(
  rawText: string,
  signal?: AbortSignal,
): Promise<ResumeParseResult> {
  if (!rawText || rawText.trim().length === 0) {
    return { ok: false, reason: "empty_input", message: "텍스트가 비어 있습니다." };
  }
  const sanitized = stripPii(rawText);

  let response;
  try {
    response = await callClaude({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: sanitized,
      signal,
    });
  } catch (e) {
    if (e instanceof ClaudeError && e.code === "no_api_key") {
      return { ok: false, reason: "no_api_key", message: "AI 파싱이 비활성화되어 있습니다." };
    }
    return {
      ok: false,
      reason: "api_error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  // 응답이 ```json...``` 또는 평문 JSON 모두 대응.
  const jsonText = extractJsonBlock(response.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      reason: "schema_invalid",
      message: "AI 응답이 유효한 JSON이 아닙니다.",
    };
  }
  const result = parsedResumeSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: "schema_invalid",
      message: `스키마 검증 실패: ${result.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  return {
    ok: true,
    parsed: result.data,
    model: response.model,
    tokensUsed: response.inputTokens + response.outputTokens,
  };
}

function extractJsonBlock(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) return fenced[1].trim();
  return text.trim();
}
