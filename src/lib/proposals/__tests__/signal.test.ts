// SPEC-PROPOSAL-001 §M2 REQ-PROPOSAL-SIGNAL-004 — signal.ts 정적 시그니처 검증.
// 본 모듈은 @/db/client에 의존하므로 (DB 연결 필요) 단위 테스트에서 import 불가.
// 실제 view 동작은 db:verify (AC-PROPOSAL-001-VIEW)가 검증.
// 본 테스트는 signal.ts 파일 자체의 정적 검증만 수행한다 (소스 코드 inspection).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SIGNAL_PATH = resolve(__dirname, "../signal.ts");

test("signal.ts: selectInstructorPriorAcceptedCount export 정적 검증", () => {
  const src = readFileSync(SIGNAL_PATH, "utf8");
  assert.match(
    src,
    /export\s+async\s+function\s+selectInstructorPriorAcceptedCount/,
    "selectInstructorPriorAcceptedCount export 누락",
  );
});

test("signal.ts: selectInstructorInquirySignal export 정적 검증", () => {
  const src = readFileSync(SIGNAL_PATH, "utf8");
  assert.match(
    src,
    /export\s+async\s+function\s+selectInstructorInquirySignal/,
    "selectInstructorInquirySignal export 누락",
  );
});

test("signal.ts: SPEC-RECOMMEND-001 score.ts 미참조 (REQ-PROPOSAL-SIGNAL-003)", () => {
  const src = readFileSync(SIGNAL_PATH, "utf8");
  // signal.ts 자체가 score.ts 또는 engine.ts를 import하지 않아야 함
  assert.equal(
    /from\s+["']@\/lib\/recommend\//.test(src),
    false,
    "signal.ts 가 lib/recommend/* 를 import 하면 안 됨",
  );
});

test("signal.ts: 인터페이스 + 90일 default 윈도우 검증", () => {
  const src = readFileSync(SIGNAL_PATH, "utf8");
  assert.match(src, /windowDays:\s*number\s*=\s*90/, "default 90일 누락");
  assert.match(src, /InstructorInquirySignal/, "InstructorInquirySignal 인터페이스 누락");
});
