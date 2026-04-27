// SPEC-DASHBOARD-001 §M1 — types/STATUS_COLUMN_MAP/colorForInstructor 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DASHBOARD_COLUMNS,
  INSTRUCTOR_COLOR_PALETTE,
  STATUS_COLUMN_MAP,
  colorForInstructor,
  isDashboardColumnLabel,
  statusToDashboardColumn,
} from "../types";
import type { ProjectStatus } from "../../projects";

test("DASHBOARD_COLUMNS: 5개 컬럼 라벨 순서 고정", () => {
  assert.deepEqual([...DASHBOARD_COLUMNS], ["의뢰", "강사매칭", "컨펌", "진행", "정산"]);
});

test("STATUS_COLUMN_MAP: 5개 컬럼 키 모두 존재", () => {
  for (const c of DASHBOARD_COLUMNS) {
    assert.ok(Array.isArray(STATUS_COLUMN_MAP[c]));
    assert.ok(STATUS_COLUMN_MAP[c].length > 0);
  }
});

test("STATUS_COLUMN_MAP: enum 값 중복/누락 없음", () => {
  const seen = new Set<ProjectStatus>();
  let total = 0;
  for (const c of DASHBOARD_COLUMNS) {
    for (const s of STATUS_COLUMN_MAP[c]) {
      assert.ok(!seen.has(s), `중복 enum 매핑: ${s}`);
      seen.add(s);
      total++;
    }
  }
  assert.equal(total, 13, "13단계 enum 모두 매핑되어야 함");
});

test("statusToDashboardColumn: 알려진 상태는 정확한 컬럼", () => {
  assert.equal(statusToDashboardColumn("proposal"), "의뢰");
  assert.equal(statusToDashboardColumn("instructor_sourcing"), "강사매칭");
  assert.equal(statusToDashboardColumn("assignment_confirmed"), "컨펌");
  assert.equal(statusToDashboardColumn("in_progress"), "진행");
  assert.equal(statusToDashboardColumn("task_done"), "정산");
});

test("isDashboardColumnLabel: 라벨 가드", () => {
  assert.equal(isDashboardColumnLabel("의뢰"), true);
  assert.equal(isDashboardColumnLabel("정산"), true);
  assert.equal(isDashboardColumnLabel("알수없는값"), false);
  assert.equal(isDashboardColumnLabel(null), false);
  assert.equal(isDashboardColumnLabel(123), false);
});

test("colorForInstructor: 결정성 (같은 ID → 같은 색)", () => {
  const a = colorForInstructor("instr-1");
  const b = colorForInstructor("instr-1");
  assert.equal(a, b);
  assert.ok(INSTRUCTOR_COLOR_PALETTE.includes(a));
});

test("colorForInstructor: 8색 사이클 안에 분포", () => {
  for (let i = 0; i < 50; i++) {
    const c = colorForInstructor(`instr-${i}`);
    assert.ok(INSTRUCTOR_COLOR_PALETTE.includes(c));
  }
});
