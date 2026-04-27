// SPEC-DASHBOARD-001 §M1 — 상태 전환 도메인 규칙 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS_FORWARD_PATH,
  canTransition,
  nextColumnLabel,
  nextStatus,
  transitionButtonLabel,
} from "../transitions";

test("STATUS_FORWARD_PATH: 13단계 모두 포함", () => {
  assert.equal(STATUS_FORWARD_PATH.length, 13);
  assert.equal(STATUS_FORWARD_PATH[0], "proposal");
  assert.equal(STATUS_FORWARD_PATH[STATUS_FORWARD_PATH.length - 1], "task_done");
});

test("nextStatus: 인접 status 반환, terminal은 null", () => {
  assert.equal(nextStatus("proposal"), "contract_confirmed");
  assert.equal(nextStatus("contract_confirmed"), "lecture_requested");
  assert.equal(nextStatus("lecture_requested"), "instructor_sourcing");
  assert.equal(nextStatus("task_done"), null);
});

test("canTransition: forward 1단계만 허용", () => {
  assert.equal(canTransition("proposal", "contract_confirmed"), true);
  assert.equal(canTransition("instructor_sourcing", "assignment_review"), true);
});

test("canTransition: skip 거부", () => {
  assert.equal(canTransition("proposal", "in_progress"), false);
  assert.equal(canTransition("proposal", "lecture_requested"), false);
});

test("canTransition: 역방향 거부", () => {
  assert.equal(canTransition("in_progress", "proposal"), false);
  assert.equal(canTransition("contract_confirmed", "proposal"), false);
});

test("canTransition: terminal에서 어떤 전이도 거부", () => {
  assert.equal(canTransition("task_done", "proposal"), false);
});

test("nextColumnLabel: 같은 컬럼 안 전이는 현재 컬럼 라벨", () => {
  // proposal → contract_confirmed: 모두 '의뢰'
  assert.equal(nextColumnLabel("proposal"), "의뢰");
});

test("nextColumnLabel: 컬럼 경계 넘는 전이는 다음 컬럼 라벨", () => {
  // lecture_requested → instructor_sourcing: 의뢰 → 강사매칭
  assert.equal(nextColumnLabel("lecture_requested"), "강사매칭");
  // assignment_review → assignment_confirmed: 강사매칭 → 컨펌
  assert.equal(nextColumnLabel("assignment_review"), "컨펌");
});

test("transitionButtonLabel: 컬럼 경계 넘으면 'X으로'", () => {
  assert.equal(transitionButtonLabel("lecture_requested"), "강사매칭으로");
  assert.equal(transitionButtonLabel("assignment_review"), "컨펌으로");
  assert.equal(transitionButtonLabel("recruiting"), "진행으로");
});

test("transitionButtonLabel: terminal 은 null", () => {
  assert.equal(transitionButtonLabel("task_done"), null);
});
