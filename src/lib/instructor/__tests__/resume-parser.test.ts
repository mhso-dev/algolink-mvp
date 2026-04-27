// SPEC-ME-001 §2.3 REQ-ME-AI-005/006/007 — AI 파싱 단위 테스트.
// Claude API mock으로 fallback 경로 검증 (실 API 호출 0건).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stripPii,
  parsedResumeSchema,
  parseResumeText,
} from "../resume-parser";

// ---------- stripPii ----------

test("stripPii: 주민등록번호 패턴 → 마스킹 토큰", () => {
  const out = stripPii("이름: 홍길동\n주민: 900101-1234567\n");
  assert.match(out, /\[REDACTED_RRN\]/);
  assert.doesNotMatch(out, /\d{6}-\d{7}/);
});

test("stripPii: dash 없는 주민번호도 마스킹", () => {
  const out = stripPii("주민9001011234567");
  assert.match(out, /\[REDACTED_RRN\]/);
});

test("stripPii: 사업자등록번호 마스킹", () => {
  const out = stripPii("법인: 123-45-67890");
  assert.match(out, /\[REDACTED_BRN\]/);
});

test("stripPii: 계좌번호 패턴 마스킹", () => {
  const out = stripPii("계좌 1002-123-456789");
  assert.match(out, /\[REDACTED_ACCT\]/);
});

test("stripPii: 일반 텍스트는 보존", () => {
  const out = stripPii("서울대학교 컴퓨터공학과 졸업");
  assert.equal(out, "서울대학교 컴퓨터공학과 졸업");
});

// ---------- parsedResumeSchema ----------

test("parsedResumeSchema: 빈 객체 → defaults 채움", () => {
  const r = parsedResumeSchema.safeParse({});
  assert.equal(r.success, true);
  if (r.success) {
    assert.deepEqual(r.data.educations, []);
    assert.deepEqual(r.data.workExperiences, []);
  }
});

test("parsedResumeSchema: 정상 데이터 통과", () => {
  const r = parsedResumeSchema.safeParse({
    educations: [
      { school: "서울대", major: "컴공", degree: "학사", startDate: "2010-03", endDate: "2014-02" },
    ],
    workExperiences: [
      { company: "네이버", position: "백엔드", startDate: "2014-03", endDate: null, description: "검색 인프라" },
    ],
  });
  assert.equal(r.success, true);
});

test("parsedResumeSchema: school 누락 → 거부", () => {
  const r = parsedResumeSchema.safeParse({
    educations: [{ major: "컴공" }],
  });
  assert.equal(r.success, false);
});

test("parsedResumeSchema: 잘못된 날짜 형식 → 거부", () => {
  const r = parsedResumeSchema.safeParse({
    educations: [{ school: "서울대", startDate: "2010/03" }],
  });
  assert.equal(r.success, false);
});

// ---------- parseResumeText (fallback paths) ----------

test("parseResumeText: 빈 입력 → empty_input", async () => {
  const r = await parseResumeText("");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "empty_input");
});

test("parseResumeText: 공백만 → empty_input", async () => {
  const r = await parseResumeText("   \n\t   ");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "empty_input");
});

test("parseResumeText: ANTHROPIC_API_KEY 부재 → no_api_key fallback", async () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const r = await parseResumeText("샘플 이력서 텍스트입니다.");
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.reason, "no_api_key");
      // 한국어 메시지 — 사용자에게 fallback 안내.
      assert.match(r.message, /AI/);
    }
  } finally {
    if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
  }
});
