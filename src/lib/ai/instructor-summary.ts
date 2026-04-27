// SPEC-INSTRUCTOR-001 §2.4 REQ-INSTRUCTOR-AI-001~011 — AI 만족도 요약 모듈.
// 이 모듈은 PII 분리(REQ-INSTRUCTOR-AI-010)와 폴백(REQ-INSTRUCTOR-AI-006)을
// 강제하는 핵심 도메인 로직이다. 클라이언트는 instructorId만 알고 호출하며
// 모든 데이터 조회/캐시/SDK 호출은 본 모듈 내부에서 수행한다.
//
// @MX:ANCHOR: getOrGenerateSummary는 강사 상세 페이지 (Suspense 경계)와
//   regenerateSummary 액션 두 곳에서 호출되는 도메인 진입점.
// @MX:REASON: 캐시·폴백·PII 분리가 모두 본 함수에서 결정되므로 fan_in이 늘면
//   계약을 깨기 쉽다. 시그니처 변경 시 주의.
// @MX:WARN: prompt 본문에는 score/comment/projectTitle/endDate만 포함.
//   강사 이름/이메일/전화/주민/계좌 절대 금지 (REQ-INSTRUCTOR-AI-010).
// @MX:REASON: 개인정보 보호법 + 외부 API 데이터 유출 방지.

import type { ReviewComment, SummaryResult } from "@/lib/instructor/types";

export const SUMMARY_CACHE_HOURS = 24;
export const SUMMARY_MIN_REVIEWS_WITH_COMMENT = 3;
export const SUMMARY_RECENT_FALLBACK = 5;
export const SUMMARY_MAX_PROMPT_REVIEWS = 50;
export const SUMMARY_TIMEOUT_MS = 30_000;
export const SUMMARY_MODEL = "claude-sonnet-4-6";

// 한국어 시스템 프롬프트 — 정적 텍스트이므로 Anthropic Prompt Caching 적용 가능.
// 입력 review 텍스트에서만 추론하도록 강제하여 환각 위험을 줄인다.
export const SUMMARY_SYSTEM_PROMPT = `당신은 한국어 강의 만족도 분석 어시스턴트입니다.

다음 규칙을 반드시 지키세요.
- 입력으로 제공된 만족도 코멘트와 점수만 사용하여 분석합니다.
- 외부 지식이나 강사에 대한 일반 평판을 사용하지 않습니다.
- 출력은 정확히 다음 마크다운 구조를 따릅니다:

### 강점
- (코멘트에서 도출한 강점 1-3개)

### 약점
- (코멘트에서 도출한 약점 1-3개. 부정 코멘트가 없으면 "특별한 약점이 발견되지 않았습니다."라고 적습니다.)

### 추천 분야
- (코멘트와 프로젝트 제목에서 추론할 수 있는 추천 강의 분야 1-3개)

추가 규칙:
- 강사의 이름·이메일·전화번호·식별 가능한 개인정보를 절대 출력하지 않습니다.
- 모든 항목은 한국어로 작성합니다.
- 코멘트가 부족하면 무리하게 추론하지 말고 발견된 사실만 적습니다.`;

export type SummaryReviewSource = ReviewComment;

export type BuiltSummaryPrompt = {
  system: { type: "text"; text: string; cache_control: { type: "ephemeral" } }[];
  userText: string;
};

/**
 * Claude API에 전달할 prompt를 구성한다.
 *
 * REQ-INSTRUCTOR-AI-004: system 블록은 prompt cache 친화 (정적 + ephemeral).
 * REQ-INSTRUCTOR-AI-010: 강사 PII (이름/이메일/전화) 절대 미포함. 호출자는
 *   ReviewComment만 전달하므로 본 함수에서 추가 차단할 필드가 없다.
 *   호출자가 잘못 끼워넣어도 형식이 SummaryReviewSource로 한정되므로 안전.
 */
export function buildSummaryPrompt(
  reviews: SummaryReviewSource[],
): BuiltSummaryPrompt {
  const lines = reviews.map((r, idx) => {
    const date = r.endDate ? r.endDate.toISOString().slice(0, 10) : "미정";
    const cleanComment = (r.comment ?? "").trim().replace(/\s+/g, " ");
    return `${idx + 1}. [점수 ${r.score}/5 · ${date} · ${r.projectTitle}] ${cleanComment}`;
  });

  const userText = `아래는 한 강사의 누적 만족도 코멘트입니다. 위 시스템 지시에 따라 강점/약점/추천 분야를 한국어로 요약해 주세요.

${lines.join("\n")}`;

  return {
    system: [
      {
        type: "text",
        text: SUMMARY_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    userText,
  };
}

// ---------------------------------------------------------------------------
// 핵심 도메인 로직 — 의존성을 인터페이스로 받는 순수 함수.
// 실제 Supabase/Anthropic 클라이언트는 server-side adapter (server.ts)에서 주입.
// ---------------------------------------------------------------------------

export interface CachedSummary {
  summary: string;
  model: string;
  generatedAt: Date;
}

export interface SummaryDeps {
  /** 24h 이내 캐시 row 조회. 없으면 null. */
  loadCache: (instructorId: string) => Promise<CachedSummary | null>;
  /** 최신 리뷰 (코멘트 보유 + score) 로드. 시간 역순. */
  loadReviews: (
    instructorId: string,
    limit: number,
  ) => Promise<SummaryReviewSource[]>;
  /** 평균 점수 + 리뷰 수 (코멘트 유무 무관). 폴백/empty 분기에 사용. */
  loadAggregate: (
    instructorId: string,
  ) => Promise<{ avgScore: number | null; reviewCount: number }>;
  /** Claude API 호출 — 실패 시 throw. */
  callClaude: (prompt: BuiltSummaryPrompt) => Promise<{
    text: string;
    model: string;
  }>;
  /** 성공한 요약을 ai_satisfaction_summaries에 UPSERT. */
  upsertCache: (input: {
    instructorId: string;
    summaryText: string;
    model: string;
  }) => Promise<void>;
  /** 현재 시각 — 테스트 주입 가능. */
  now: () => Date;
  /** 폴백 시 노출용 최근 코멘트 (최대 N건). */
  loadRecentForFallback: (
    instructorId: string,
    limit: number,
  ) => Promise<SummaryReviewSource[]>;
}

export function isFreshCache(
  cached: CachedSummary,
  now: Date,
  cacheHours = SUMMARY_CACHE_HOURS,
): boolean {
  const ageMs = now.getTime() - cached.generatedAt.getTime();
  return ageMs >= 0 && ageMs <= cacheHours * 60 * 60 * 1000;
}

function classifyError(err: unknown): "timeout" | "api_error" | "quota" {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("aborted")) return "timeout";
    if (
      msg.includes("quota") ||
      msg.includes("rate") ||
      msg.includes("429") ||
      msg.includes("401") ||
      msg.includes("403")
    ) {
      return "quota";
    }
  }
  return "api_error";
}

/**
 * 강사 만족도 요약을 캐시 우선으로 조회하거나 새로 생성한다.
 *
 * 흐름 (REQ-INSTRUCTOR-AI-001/002/006/007):
 *   1) 24h 캐시가 있으면 → kind: 'ai' (cached: true)
 *   2) 코멘트 있는 review가 3건 미만 → kind: 'empty'
 *   3) Claude 호출 성공 → UPSERT 후 kind: 'ai'
 *   4) Claude 호출 실패 → kind: 'fallback' (avg + 최근 5건)
 *
 * @param instructorId 강사 UUID
 * @param deps 외부 의존성 — 실제 어댑터 또는 mock
 * @param opts.force true면 캐시 무시하고 새로 생성 (재생성 액션용)
 */
export async function getOrGenerateSummary(
  instructorId: string,
  deps: SummaryDeps,
  opts: { force?: boolean } = {},
): Promise<SummaryResult> {
  const force = opts.force === true;

  if (!force) {
    const cached = await deps.loadCache(instructorId);
    if (cached && isFreshCache(cached, deps.now())) {
      return {
        kind: "ai",
        summary: cached.summary,
        model: cached.model,
        generatedAt: cached.generatedAt,
        cached: true,
      };
    }
  }

  const reviews = await deps.loadReviews(
    instructorId,
    SUMMARY_MAX_PROMPT_REVIEWS,
  );
  const reviewsWithComment = reviews.filter(
    (r) => typeof r.comment === "string" && r.comment.trim().length > 0,
  );

  if (reviewsWithComment.length < SUMMARY_MIN_REVIEWS_WITH_COMMENT) {
    return {
      kind: "empty",
      reviewCount: reviewsWithComment.length,
    };
  }

  const prompt = buildSummaryPrompt(reviewsWithComment);

  try {
    const response = await deps.callClaude(prompt);
    await deps.upsertCache({
      instructorId,
      summaryText: response.text,
      model: response.model,
    });
    return {
      kind: "ai",
      summary: response.text,
      model: response.model,
      generatedAt: deps.now(),
      cached: false,
    };
  } catch (err) {
    const reason = classifyError(err);
    const aggregate = await deps.loadAggregate(instructorId);
    const recent = await deps.loadRecentForFallback(
      instructorId,
      SUMMARY_RECENT_FALLBACK,
    );
    return {
      kind: "fallback",
      avgScore: aggregate.avgScore,
      reviewCount: aggregate.reviewCount,
      recentComments: recent,
      reason,
    };
  }
}
