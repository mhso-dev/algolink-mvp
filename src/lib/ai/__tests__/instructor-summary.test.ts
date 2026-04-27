// SPEC-INSTRUCTOR-001 §2.4 REQ-INSTRUCTOR-AI-001~011 — AI 요약 단위 테스트.
// PII 차단(REQ-INSTRUCTOR-AI-010), 캐시(REQ-INSTRUCTOR-AI-002),
// 폴백(REQ-INSTRUCTOR-AI-006), 데이터 부족(REQ-INSTRUCTOR-AI-007)을 검증.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSummaryPrompt,
  getOrGenerateSummary,
  isFreshCache,
  SUMMARY_CACHE_HOURS,
  SUMMARY_MIN_REVIEWS_WITH_COMMENT,
  SUMMARY_RECENT_FALLBACK,
  SUMMARY_SYSTEM_PROMPT,
  type CachedSummary,
  type SummaryDeps,
  type SummaryReviewSource,
} from "../instructor-summary";

// PII가 절대 포함되어선 안 되는 토큰 — 등록 폼/RLS와 상관없이 prompt 본문 검사.
const PII_TOKENS_BANNED = [
  "김리액트",
  "kim@test.local",
  "010-1234-5678",
  "010-9999-8888",
  "950101-1234567",
  "110-123-456789",
];

const sampleReviews: SummaryReviewSource[] = [
  {
    score: 5,
    comment: "설명이 명확하고 실습 예제가 풍부했습니다.",
    projectTitle: "React 심화 과정",
    endDate: new Date("2026-03-10T15:00:00Z"),
  },
  {
    score: 4,
    comment: "진도가 빨라 따라가기 어려웠지만 자료가 좋음.",
    projectTitle: "TypeScript 워크숍",
    endDate: new Date("2026-02-01T15:00:00Z"),
  },
  {
    score: 5,
    comment: "Q&A 응대가 친절했고 추가 자료를 제공함.",
    projectTitle: "Next.js 부트캠프",
    endDate: new Date("2026-01-12T15:00:00Z"),
  },
];

// ---------- buildSummaryPrompt ----------

test("buildSummaryPrompt: system 블록은 정적 텍스트 + cache_control: ephemeral", () => {
  const built = buildSummaryPrompt(sampleReviews);
  assert.equal(built.system.length, 1);
  assert.equal(built.system[0].type, "text");
  assert.equal(built.system[0].text, SUMMARY_SYSTEM_PROMPT);
  assert.deepEqual(built.system[0].cache_control, { type: "ephemeral" });
});

test("buildSummaryPrompt: user 본문에 score/comment/projectTitle/date 포함", () => {
  const built = buildSummaryPrompt(sampleReviews);
  assert.match(built.userText, /설명이 명확/);
  assert.match(built.userText, /React 심화 과정/);
  assert.match(built.userText, /점수 5\/5/);
  assert.match(built.userText, /2026-03-10/);
});

test("buildSummaryPrompt: PII 토큰이 system + user 어디에도 포함되지 않음 (REQ-AI-010)", () => {
  const built = buildSummaryPrompt(sampleReviews);
  const fullPrompt = `${built.system.map((s) => s.text).join("\n")}\n${built.userText}`;
  for (const banned of PII_TOKENS_BANNED) {
    assert.equal(
      fullPrompt.includes(banned),
      false,
      `PII 토큰이 prompt에 포함됨: ${banned}`,
    );
  }
});

test("buildSummaryPrompt: 시스템 프롬프트는 한국어 분석 페르소나 + 환각 금지 명시", () => {
  assert.match(SUMMARY_SYSTEM_PROMPT, /한국어 강의 만족도 분석/);
  assert.match(SUMMARY_SYSTEM_PROMPT, /외부 지식.*사용하지 않습니다/);
  assert.match(SUMMARY_SYSTEM_PROMPT, /강점/);
  assert.match(SUMMARY_SYSTEM_PROMPT, /약점/);
  assert.match(SUMMARY_SYSTEM_PROMPT, /추천 분야/);
});

// ---------- isFreshCache ----------

test("isFreshCache: 23시간 전 row → fresh", () => {
  const now = new Date("2026-04-28T10:00:00Z");
  const cached: CachedSummary = {
    summary: "x",
    model: "claude-sonnet-4-6",
    generatedAt: new Date(now.getTime() - 23 * 60 * 60 * 1000),
  };
  assert.equal(isFreshCache(cached, now), true);
});

test("isFreshCache: 25시간 전 row → stale", () => {
  const now = new Date("2026-04-28T10:00:00Z");
  const cached: CachedSummary = {
    summary: "x",
    model: "claude-sonnet-4-6",
    generatedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
  };
  assert.equal(isFreshCache(cached, now), false);
});

test("isFreshCache: 정확히 24h 경계 → fresh (inclusive)", () => {
  const now = new Date("2026-04-28T10:00:00Z");
  const cached: CachedSummary = {
    summary: "x",
    model: "claude-sonnet-4-6",
    generatedAt: new Date(
      now.getTime() - SUMMARY_CACHE_HOURS * 60 * 60 * 1000,
    ),
  };
  assert.equal(isFreshCache(cached, now), true);
});

// ---------- getOrGenerateSummary ----------

type CallLog = {
  loadCache: number;
  loadReviews: number;
  callClaude: number;
  upsertCache: number;
  loadAggregate: number;
  loadRecentForFallback: number;
};

function makeDeps(opts: {
  cache?: CachedSummary | null;
  reviews?: SummaryReviewSource[];
  aggregate?: { avgScore: number | null; reviewCount: number };
  recent?: SummaryReviewSource[];
  claudeImpl?: () => Promise<{ text: string; model: string }>;
  now?: Date;
}): { deps: SummaryDeps; log: CallLog } {
  const log: CallLog = {
    loadCache: 0,
    loadReviews: 0,
    callClaude: 0,
    upsertCache: 0,
    loadAggregate: 0,
    loadRecentForFallback: 0,
  };
  const deps: SummaryDeps = {
    loadCache: async () => {
      log.loadCache++;
      return opts.cache ?? null;
    },
    loadReviews: async () => {
      log.loadReviews++;
      return opts.reviews ?? [];
    },
    loadAggregate: async () => {
      log.loadAggregate++;
      return opts.aggregate ?? { avgScore: null, reviewCount: 0 };
    },
    callClaude: async () => {
      log.callClaude++;
      if (opts.claudeImpl) return opts.claudeImpl();
      return { text: "### 강점\n- 기본\n", model: "claude-sonnet-4-6" };
    },
    upsertCache: async () => {
      log.upsertCache++;
    },
    loadRecentForFallback: async () => {
      log.loadRecentForFallback++;
      return opts.recent ?? [];
    },
    now: () => opts.now ?? new Date("2026-04-28T10:00:00Z"),
  };
  return { deps, log };
}

test("getOrGenerateSummary: 캐시 hit → SDK 미호출, kind=ai cached=true", async () => {
  const now = new Date("2026-04-28T10:00:00Z");
  const cache: CachedSummary = {
    summary: "### 강점\n- 캐시된 요약",
    model: "claude-sonnet-4-6",
    generatedAt: new Date(now.getTime() - 60 * 60 * 1000), // 1시간 전
  };
  const { deps, log } = makeDeps({ cache, now });

  const res = await getOrGenerateSummary("inst-1", deps);

  assert.equal(res.kind, "ai");
  if (res.kind !== "ai") return;
  assert.equal(res.cached, true);
  assert.equal(res.summary, cache.summary);
  assert.equal(log.callClaude, 0);
  assert.equal(log.loadReviews, 0);
  assert.equal(log.upsertCache, 0);
});

test("getOrGenerateSummary: 캐시 stale → 새로 호출 + UPSERT + cached=false", async () => {
  const now = new Date("2026-04-28T10:00:00Z");
  const cache: CachedSummary = {
    summary: "old",
    model: "claude-sonnet-4-6",
    generatedAt: new Date(now.getTime() - 30 * 60 * 60 * 1000), // 30시간 전
  };
  const { deps, log } = makeDeps({
    cache,
    reviews: sampleReviews,
    now,
    claudeImpl: async () => ({
      text: "### 강점\n- 신규",
      model: "claude-sonnet-4-6",
    }),
  });

  const res = await getOrGenerateSummary("inst-1", deps);

  assert.equal(res.kind, "ai");
  if (res.kind !== "ai") return;
  assert.equal(res.cached, false);
  assert.equal(log.callClaude, 1);
  assert.equal(log.upsertCache, 1);
});

test("getOrGenerateSummary: 코멘트 있는 review < 3 → kind=empty, SDK 미호출", async () => {
  const onlyOneComment: SummaryReviewSource[] = [
    sampleReviews[0],
    { ...sampleReviews[1], comment: "" },
    { ...sampleReviews[2], comment: "   " },
  ];
  const { deps, log } = makeDeps({ reviews: onlyOneComment });

  const res = await getOrGenerateSummary("inst-1", deps);

  assert.equal(res.kind, "empty");
  if (res.kind !== "empty") return;
  assert.equal(res.reviewCount, 1);
  assert.equal(log.callClaude, 0);
  assert.equal(log.upsertCache, 0);
});

test("getOrGenerateSummary: 코멘트 정확히 3건 → 호출 (boundary)", async () => {
  const { deps, log } = makeDeps({ reviews: sampleReviews });
  const res = await getOrGenerateSummary("inst-1", deps);
  assert.equal(res.kind, "ai");
  assert.equal(log.callClaude, 1);
  assert.equal(SUMMARY_MIN_REVIEWS_WITH_COMMENT, 3);
});

test("getOrGenerateSummary: Claude timeout → kind=fallback, reason=timeout", async () => {
  const { deps, log } = makeDeps({
    reviews: sampleReviews,
    aggregate: { avgScore: 4.5, reviewCount: 3 },
    recent: sampleReviews,
    claudeImpl: async () => {
      throw new Error("Request timeout after 30000ms");
    },
  });

  const res = await getOrGenerateSummary("inst-1", deps);

  assert.equal(res.kind, "fallback");
  if (res.kind !== "fallback") return;
  assert.equal(res.reason, "timeout");
  assert.equal(res.avgScore, 4.5);
  assert.equal(res.reviewCount, 3);
  assert.equal(res.recentComments.length, 3);
  assert.equal(log.upsertCache, 0); // 폴백은 캐시에 쓰지 않음
});

test("getOrGenerateSummary: Claude 5xx → kind=fallback, reason=api_error", async () => {
  const { deps } = makeDeps({
    reviews: sampleReviews,
    aggregate: { avgScore: 3.8, reviewCount: 5 },
    recent: sampleReviews.slice(0, 2),
    claudeImpl: async () => {
      throw new Error("Internal server error 503");
    },
  });

  const res = await getOrGenerateSummary("inst-1", deps);
  assert.equal(res.kind, "fallback");
  if (res.kind !== "fallback") return;
  assert.equal(res.reason, "api_error");
  assert.equal(res.recentComments.length, 2);
});

test("getOrGenerateSummary: Claude 401 auth 실패 → kind=fallback, reason=quota", async () => {
  const { deps } = makeDeps({
    reviews: sampleReviews,
    aggregate: { avgScore: 4.0, reviewCount: 3 },
    recent: sampleReviews,
    claudeImpl: async () => {
      throw new Error("401 Unauthorized: invalid api key");
    },
  });

  const res = await getOrGenerateSummary("inst-1", deps);
  assert.equal(res.kind, "fallback");
  if (res.kind !== "fallback") return;
  assert.equal(res.reason, "quota");
});

test("getOrGenerateSummary: force=true면 캐시 무시 + SDK 호출", async () => {
  const now = new Date("2026-04-28T10:00:00Z");
  const freshCache: CachedSummary = {
    summary: "stale-but-fresh",
    model: "claude-sonnet-4-6",
    generatedAt: new Date(now.getTime() - 60 * 60 * 1000),
  };
  const { deps, log } = makeDeps({
    cache: freshCache,
    reviews: sampleReviews,
    now,
  });

  const res = await getOrGenerateSummary("inst-1", deps, { force: true });

  assert.equal(res.kind, "ai");
  if (res.kind !== "ai") return;
  assert.equal(res.cached, false);
  assert.equal(log.callClaude, 1);
  assert.equal(log.upsertCache, 1);
  // force는 cache 조회 자체를 건너뜀
  assert.equal(log.loadCache, 0);
});

test("getOrGenerateSummary: PII가 prompt 호출에 전달되지 않음 (callClaude 인자 검사)", async () => {
  let capturedPrompt = "";
  const { deps } = makeDeps({
    reviews: sampleReviews,
    claudeImpl: async () => ({
      text: "ok",
      model: "claude-sonnet-4-6",
    }),
  });
  // callClaude를 래핑해서 인자 capture
  const originalCallClaude = deps.callClaude;
  deps.callClaude = async (prompt) => {
    capturedPrompt = `${prompt.system.map((s) => s.text).join("\n")}\n${prompt.userText}`;
    return originalCallClaude(prompt);
  };

  await getOrGenerateSummary("inst-1", deps);

  for (const banned of PII_TOKENS_BANNED) {
    assert.equal(
      capturedPrompt.includes(banned),
      false,
      `PII 토큰이 Claude 호출에 전달됨: ${banned}`,
    );
  }
});

test("SUMMARY_RECENT_FALLBACK 상수는 5 (REQ-INSTRUCTOR-AI-006)", () => {
  assert.equal(SUMMARY_RECENT_FALLBACK, 5);
});
