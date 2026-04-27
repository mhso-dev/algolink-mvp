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
