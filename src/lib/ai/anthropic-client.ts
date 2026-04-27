// SPEC-INSTRUCTOR-001 §2.4 REQ-INSTRUCTOR-AI-003 — Anthropic SDK 클라이언트.
// 서버 전용 — 절대 클라이언트 번들로 노출 금지.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "[ai.anthropic] ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.",
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}
