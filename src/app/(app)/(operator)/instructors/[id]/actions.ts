"use server";

// SPEC-INSTRUCTOR-001 §2.4 REQ-INSTRUCTOR-AI-009 — 재생성 액션 (캐시 우회).

import { revalidatePath } from "next/cache";
import { getOrGenerateInstructorSummary } from "@/lib/ai/instructor-summary-server";

// 강사별 1분 rate limit (인메모리 — single-instance 가정).
const lastGen = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

export type RegenerateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function regenerateSummary(
  instructorId: string,
): Promise<RegenerateResult> {
  if (!instructorId) {
    return { ok: false, error: "잘못된 요청입니다." };
  }
  const now = Date.now();
  const last = lastGen.get(instructorId);
  if (last && now - last < RATE_LIMIT_MS) {
    return {
      ok: false,
      error: "잠시 후 다시 시도해주세요. (1분에 1회 재생성 가능)",
    };
  }
  lastGen.set(instructorId, now);

  await getOrGenerateInstructorSummary(instructorId, { force: true });
  revalidatePath(`/instructors/${instructorId}`);
  return { ok: true };
}
