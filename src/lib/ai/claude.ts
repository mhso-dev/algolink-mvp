// @MX:NOTE: SPEC-PROJECT-001 §5.5 — Claude 추천 사유 생성기.
// 의존성 미설치 시(mocking 또는 키 없음) null 반환하여 룰 기반 폴백으로 자동 강등.

import type { ReasonGenerator } from "@/lib/recommend/engine";
import type { CandidateScore } from "@/lib/recommend/types";

const RECOMMEND_DEFAULT_MODEL = "claude-sonnet-4-6";
const RECOMMEND_TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `당신은 교육 컨설팅 회사 알고링크의 강사 매칭 전문가입니다.
주어진 프로젝트와 Top-N 강사 후보(점수 포함)에 대해, 각 강사가 왜 적합한지 한국어로 1-2문장으로 설명하세요.
응답은 반드시 다음 JSON schema 만 출력합니다:
{
  "candidates": [
    { "instructorId": "<uuid>", "reason": "<10~280자 한국어 설명>" }
  ]
}
- 다른 텍스트, 마크다운, code fence 를 포함하지 마세요.
- 각 reason 은 강사의 기술스택 매칭, 만족도, 일정 가용성 중 가장 두드러진 요소를 언급하세요.
- AI 추천은 참고용이며 최종 배정은 담당자가 결정한다는 점을 인지하고 객관적으로 작성하세요.`;

interface AnthropicMessageContent {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content?: AnthropicMessageContent[];
}

/**
 * Claude SDK 가 환경에 없거나(모킹 환경) API 키가 없으면 null 반환 → 룰 기반 폴백 사용.
 */
export function buildClaudeReasonGenerator(): ReasonGenerator | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // 동적 import — @anthropic-ai/sdk 가 설치되지 않은 환경에서도 빌드/타입 체크 통과.
  return {
    modelName: process.env.ANTHROPIC_MODEL_RECOMMEND ?? RECOMMEND_DEFAULT_MODEL,
    async generate({ project, topCandidates }) {
      const sdk = await loadAnthropicSdk();
      if (!sdk) throw new Error("@anthropic-ai/sdk not installed");

      const userPayload = {
        project: {
          id: project.projectId,
          requiredSkillIds: project.requiredSkillIds,
          startAt: project.startAt.toISOString(),
          endAt: project.endAt.toISOString(),
        },
        candidates: topCandidates.map((c) => ({
          instructorId: c.instructorId,
          skillMatch: Number(c.skillMatch.toFixed(3)),
          availability: c.availability,
          satisfaction: Number(c.satisfaction.toFixed(3)),
          finalScore: Number(c.finalScore.toFixed(3)),
          matchedSkillIds: c.matchedSkillIds,
        })),
      };

      const client = new sdk.default({ apiKey });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RECOMMEND_TIMEOUT_MS);
      try {
        const message = (await client.messages.create(
          {
            model: process.env.ANTHROPIC_MODEL_RECOMMEND ?? RECOMMEND_DEFAULT_MODEL,
            max_tokens: 1024,
            system: [
              {
                type: "text",
                text: SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            messages: [
              {
                role: "user",
                content: JSON.stringify(userPayload),
              },
            ],
          },
          { signal: controller.signal },
        )) as AnthropicResponse;

        const textBlock = (message.content ?? []).find(
          (b) => b.type === "text" && typeof b.text === "string",
        );
        if (!textBlock?.text) throw new Error("empty Claude response");

        return parseClaudeReasonResponse(textBlock.text, topCandidates);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

interface RawCandidate {
  instructorId: unknown;
  reason: unknown;
}
interface RawResponse {
  candidates?: RawCandidate[];
}

/** Claude 응답 파싱 + 검증. zod 미설치 환경에서도 동작하도록 manual validation. */
export function parseClaudeReasonResponse(
  text: string,
  topCandidates: CandidateScore[],
): Map<string, string> {
  const trimmed = text.trim();
  let parsed: RawResponse;
  try {
    parsed = JSON.parse(trimmed) as RawResponse;
  } catch (err) {
    throw new Error(
      `Claude response is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!Array.isArray(parsed.candidates)) {
    throw new Error("Claude response missing 'candidates' array");
  }
  const out = new Map<string, string>();
  const validIds = new Set(topCandidates.map((c) => c.instructorId));
  for (const c of parsed.candidates) {
    if (
      typeof c.instructorId !== "string" ||
      typeof c.reason !== "string" ||
      c.reason.length < 5 ||
      c.reason.length > 400
    ) {
      throw new Error("Claude response candidate has invalid shape");
    }
    if (!validIds.has(c.instructorId)) continue;
    out.set(c.instructorId, c.reason);
  }
  return out;
}

// 동적 SDK 로드 — 미설치 시 null
type AnthropicSdkModule = {
  default: new (config: { apiKey: string }) => {
    messages: {
      create: (...args: unknown[]) => Promise<unknown>;
    };
  };
};

async function loadAnthropicSdk(): Promise<AnthropicSdkModule | null> {
  try {
    // 동적 import — 미설치 시 catch. 변수 우회로 webpack 정적 분석 회피.
    const moduleName = "@anthropic-ai/sdk";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = (await import(/* webpackIgnore: true */ moduleName as any)) as
      | AnthropicSdkModule
      | { default?: AnthropicSdkModule["default"] };
    if (!mod || !("default" in mod) || !mod.default) return null;
    return mod as AnthropicSdkModule;
  } catch {
    return null;
  }
}

// SPEC-ME-001 §2.3 REQ-ME-AI-003 — Claude API 클라이언트 (mock-friendly).
// @MX:WARN: 호출 실패 시 fallback 보장 (REQ-ME-AI-006 — product.md §6 제약).
// @MX:REASON: AI 의존이 사용자 path를 막아선 안 됨. 항상 수동 입력 경로 유지.
// @MX:NOTE: ANTHROPIC_API_KEY 부재 또는 NODE_ENV=test 환경에서는 mock 응답 반환.

// @MX:NOTE: 본 모듈은 server-only 환경에서만 사용해야 한다 (ANTHROPIC_API_KEY 노출 방지).
// 그러나 단위 테스트에서 fallback 경로(no_api_key) 검증을 위해 직접 import 가능하도록
// "server-only" 가드는 호출 페이지/Server Action에서 적용한다.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL_DEFAULT ?? "claude-sonnet-4-5-20250929";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ClaudeMessageOptions {
  systemPrompt: string;
  userMessage: string;
  model?: string;
  maxTokens?: number;
  /** 외부에서 abort 가능. 미지정 시 내부 timeout 자동 적용. */
  signal?: AbortSignal;
}

export interface ClaudeMessageResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Claude messages API 호출. JSON 응답 텍스트만 추출.
 *
 * NOTE: ANTHROPIC_API_KEY 부재 시 즉시 throw → 호출자가 fallback 경로로 전환.
 */
export async function callClaude(opts: ClaudeMessageOptions): Promise<ClaudeMessageResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeError("ANTHROPIC_API_KEY가 설정되어 있지 않습니다.", "no_api_key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  // 외부 signal과 합성.
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? 4096,
        system: [
          {
            type: "text",
            text: opts.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: opts.userMessage }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ClaudeError(
        `Claude API 호출 실패: status=${res.status} body=${body.slice(0, 200)}`,
        "http_error",
      );
    }

    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = json.content
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text!)
      .join("");
    if (!text) {
      throw new ClaudeError("Claude API 응답이 비어 있습니다.", "empty_response");
    }
    return {
      text,
      model: json.model,
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    };
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new ClaudeError("Claude API 호출 타임아웃", "timeout");
    }
    throw new ClaudeError(`Claude API 네트워크 오류: ${(e as Error).message}`, "network_error");
  } finally {
    clearTimeout(timer);
  }
}

export type ClaudeErrorCode =
  | "no_api_key"
  | "http_error"
  | "empty_response"
  | "timeout"
  | "network_error";

export class ClaudeError extends Error {
  constructor(
    message: string,
    public readonly code: ClaudeErrorCode,
  ) {
    super(message);
    this.name = "ClaudeError";
  }
}
