// SPEC-RECOMMEND-001 REQ-RECOMMEND-006 — RecommendationPanel UI 텍스트/구조 회귀 가드.
//
// This file is a static-source check because @testing-library/react and Vitest are not
// installed in this project. Acceptance scenarios 8–11 of SPEC-RECOMMEND-001 are
// documented as MANUAL gates and must be verified once via `pnpm dev` per the steps below.
//
// Manual verification steps (acceptance.md scenarios 8–11):
//   1. Run `pnpm dev` and open http://localhost:3000.
//   2. Log in as operator (operator@algolink.test) and visit /projects/{id} for a
//      project with required_skill_ids set and instructor_id NULL. Verify the card
//      header reads "강사 추천" with NO "AI" prefix and NO model badge next to it
//      (acceptance scenario 8).
//   3. Click "추천 실행". While the request is pending, verify the loading region
//      (role="status") shows "추천을 생성하고 있습니다…" with NO "AI가" prefix
//      (acceptance scenario 10).
//   4. After the result renders, verify each candidate row shows NO "AI 사유" badge
//      and NO "룰 기반" badge. Score / 일정 OK·충돌 / 만족도 라벨은 보존
//      (acceptance scenario 9). Verify disclaimer text reads
//      "강사 추천은 참고용이며 최종 배정은 담당자가 결정합니다." (acceptance scenario 11).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const PANEL_PATH = path.resolve(
  process.cwd(),
  "src/components/projects/recommendation-panel.tsx",
);

function readPanelSource(): string {
  return fs.readFileSync(PANEL_PATH, "utf8");
}

test("recommendation-panel.tsx: 'AI 강사 추천' 헤더 텍스트 부재", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-006(1) — 헤더에서 'AI' 어휘 제거.
  const source = readPanelSource();
  assert.ok(
    !source.includes("AI 강사 추천"),
    `'AI 강사 추천' 텍스트가 컴포넌트에 남아 있으면 안 된다.`,
  );
});

test("recommendation-panel.tsx: '강사 추천' 헤더 텍스트 존재", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-006(1) — 신규 헤더 텍스트.
  const source = readPanelSource();
  assert.ok(
    source.includes("강사 추천"),
    `'강사 추천' 헤더 텍스트가 컴포넌트에 존재해야 한다.`,
  );
});

test("recommendation-panel.tsx: model 배지 렌더 코드 부재", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-006(2) — model 배지 DOM 제거.
  const source = readPanelSource();
  // 공백/줄바꿈 허용 regex 로 model 배지 conditional render 패턴 탐지.
  const modelBadgePattern = /\{\s*model\s*&&\s*\(\s*<Badge/;
  assert.ok(
    !modelBadgePattern.test(source),
    `'{model && (<Badge ...>{model}</Badge>)}' 형태의 헤더 model 배지가 제거되어야 한다.`,
  );
});

test("recommendation-panel.tsx: source 배지 ternary ('AI 사유' / '룰 기반') 부재", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-006(3) — 후보별 source 배지 DOM 제거.
  const source = readPanelSource();
  assert.ok(
    !source.includes('"AI 사유"'),
    `'AI 사유' 배지 텍스트가 컴포넌트에 남아 있으면 안 된다.`,
  );
  assert.ok(
    !source.includes('"룰 기반"'),
    `'룰 기반' 배지 텍스트가 컴포넌트에 남아 있으면 안 된다.`,
  );
  // ternary 자체도 부재.
  assert.ok(
    !source.includes('c.source === "claude" ? "AI 사유"'),
    `'c.source === "claude" ? "AI 사유"' ternary 가 제거되어야 한다.`,
  );
});

test("recommendation-panel.tsx: 'AI가 추천을 생성' 로딩 문구 부재", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-006(4) — 로딩 텍스트에서 'AI가' 제거.
  const source = readPanelSource();
  assert.ok(
    !source.includes("AI가 추천을 생성"),
    `'AI가 추천을 생성' 로딩 문구가 컴포넌트에 남아 있으면 안 된다.`,
  );
});

test("recommendation-panel.tsx: '추천을 생성하고 있습니다…' 로딩 문구 존재", () => {
  // SPEC-RECOMMEND-001 REQ-RECOMMEND-006(4) — 신규 로딩 문구.
  const source = readPanelSource();
  assert.ok(
    source.includes("추천을 생성하고 있습니다…"),
    `'추천을 생성하고 있습니다…' 로딩 문구가 존재해야 한다.`,
  );
});

test("recommendation-panel.tsx: model state 제거 (setModel 미사용)", () => {
  // SPEC-RECOMMEND-001 결정 D-2 — model 배지 제거에 따라 model state 자체도 제거.
  const source = readPanelSource();
  assert.ok(
    !source.includes("setModel"),
    `setModel 호출/선언이 컴포넌트에 남아 있으면 안 된다 (model state 가 제거되어야 함).`,
  );
});
