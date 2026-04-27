// SPEC-INSTRUCTOR-001 §2.4 — 서버 어댑터 (Supabase + Anthropic 결합).
// 도메인 로직은 instructor-summary.ts (순수)에서 검증된다.

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getAnthropicClient } from "./anthropic-client";
import {
  getOrGenerateSummary as coreGetOrGenerate,
  SUMMARY_MAX_PROMPT_REVIEWS,
  SUMMARY_MODEL,
  SUMMARY_RECENT_FALLBACK,
  SUMMARY_TIMEOUT_MS,
  type BuiltSummaryPrompt,
  type CachedSummary,
  type SummaryDeps,
  type SummaryReviewSource,
} from "./instructor-summary";
import type { SummaryResult } from "@/lib/instructor/types";

type CacheRow = {
  summary_text: string;
  model: string;
  generated_at: string;
};

type ReviewWithProjectRow = {
  score: number;
  comment: string | null;
  projects:
    | { title: string | null; education_end_at: string | null }
    | { title: string | null; education_end_at: string | null }[]
    | null;
};

type ScoreRow = { score: number };

async function makeServerDeps(): Promise<SummaryDeps> {
  const supabase = createClient(await cookies());

  const loadCache = async (
    instructorId: string,
  ): Promise<CachedSummary | null> => {
    const { data } = await supabase
      .from("ai_satisfaction_summaries")
      .select("summary_text, model, generated_at")
      .eq("instructor_id", instructorId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .returns<CacheRow[]>();
    const row = data?.[0];
    if (!row) return null;
    return {
      summary: row.summary_text,
      model: row.model,
      generatedAt: new Date(row.generated_at),
    };
  };

  const loadReviews = async (
    instructorId: string,
    limit: number,
  ): Promise<SummaryReviewSource[]> => {
    const { data } = await supabase
      .from("satisfaction_reviews")
      .select("score, comment, projects(title, education_end_at)")
      .eq("instructor_id", instructorId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<ReviewWithProjectRow[]>();
    if (!data) return [];
    return data.map((row) => {
      const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects;
      return {
        score: row.score,
        comment: row.comment ?? "",
        projectTitle: proj?.title ?? "(프로젝트 미상)",
        endDate: proj?.education_end_at ? new Date(proj.education_end_at) : null,
      };
    });
  };

  const loadAggregate = async (instructorId: string) => {
    const { data } = await supabase
      .from("satisfaction_reviews")
      .select("score")
      .eq("instructor_id", instructorId)
      .returns<ScoreRow[]>();
    const arr = data ?? [];
    if (arr.length === 0) {
      return { avgScore: null, reviewCount: 0 };
    }
    const sum = arr.reduce((s, r) => s + (r.score ?? 0), 0);
    return { avgScore: sum / arr.length, reviewCount: arr.length };
  };

  const loadRecentForFallback = async (
    instructorId: string,
    limit: number,
  ): Promise<SummaryReviewSource[]> => loadReviews(instructorId, limit);

  const callClaude = async (prompt: BuiltSummaryPrompt) => {
    const client = getAnthropicClient();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);
    try {
      const response = await client.messages.create(
        {
          model: SUMMARY_MODEL,
          max_tokens: 1024,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.userText }],
        },
        { signal: controller.signal },
      );
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { type: "text"; text: string }).text)
        .join("\n")
        .trim();
      return { text, model: response.model };
    } finally {
      clearTimeout(timer);
    }
  };

  const upsertCache = async (input: {
    instructorId: string;
    summaryText: string;
    model: string;
  }) => {
    // ai_satisfaction_summaries는 instructor_id UNIQUE가 없을 수 있어 INSERT.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("ai_satisfaction_summaries").insert({
      instructor_id: input.instructorId,
      summary_text: input.summaryText,
      model: input.model,
    });
  };

  return {
    loadCache,
    loadReviews,
    loadAggregate,
    loadRecentForFallback,
    callClaude,
    upsertCache,
    now: () => new Date(),
  };
}

export async function getOrGenerateInstructorSummary(
  instructorId: string,
  opts: { force?: boolean } = {},
): Promise<SummaryResult> {
  const deps = await makeServerDeps();
  return coreGetOrGenerate(instructorId, deps, opts);
}

export {
  SUMMARY_MAX_PROMPT_REVIEWS,
  SUMMARY_RECENT_FALLBACK,
  SUMMARY_MODEL,
};
