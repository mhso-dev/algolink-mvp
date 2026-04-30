// SPEC-PROJECT-001 §2.2/§2.4 — 프로젝트 등록/수정 zod 스키마 검증.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createProjectSchema,
  updateProjectSchema,
} from "../project";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

test("createProjectSchema: 정상 입력", () => {
  const r = createProjectSchema.safeParse({
    title: "AI 워크샵",
    clientId: VALID_UUID,
    projectType: "education",
    startAt: "2026-05-01",
    endAt: "2026-05-03",
    requiredSkillIds: [VALID_UUID],
    businessAmountKrw: 1000000,
    instructorFeeKrw: 800000,
    notes: "메모",
  });
  assert.equal(r.success, true);
});

test("createProjectSchema: title 빈 문자열 거부", () => {
  const r = createProjectSchema.safeParse({
    title: "",
    clientId: VALID_UUID,
    requiredSkillIds: [],
    businessAmountKrw: 0,
    instructorFeeKrw: 0,
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const titleErr = r.error.issues.find((i) => i.path.includes("title"));
    assert.ok(titleErr, "title 에러 존재");
  }
});

test("createProjectSchema: date-only 종료일 < 시작일 거부", () => {
  const r = createProjectSchema.safeParse({
    title: "x",
    clientId: VALID_UUID,
    startAt: "2026-05-02",
    endAt: "2026-05-01",
    requiredSkillIds: [],
    businessAmountKrw: 0,
    instructorFeeKrw: 0,
  });
  assert.equal(r.success, false);
});

test("createProjectSchema: date-only 같은 날 시작/종료 허용", () => {
  const r = createProjectSchema.safeParse({
    title: "x",
    clientId: VALID_UUID,
    startAt: "2026-05-01",
    endAt: "2026-05-01",
    requiredSkillIds: [],
    businessAmountKrw: 0,
    instructorFeeKrw: 0,
  });
  assert.equal(r.success, true);
});

test("createProjectSchema: clientId 비-UUID 거부", () => {
  const r = createProjectSchema.safeParse({
    title: "x",
    clientId: "not-uuid",
    requiredSkillIds: [],
    businessAmountKrw: 0,
    instructorFeeKrw: 0,
  });
  assert.equal(r.success, false);
});

test("createProjectSchema: businessAmountKrw 음수 거부", () => {
  const r = createProjectSchema.safeParse({
    title: "x",
    clientId: VALID_UUID,
    requiredSkillIds: [],
    businessAmountKrw: -100,
    instructorFeeKrw: 0,
  });
  assert.equal(r.success, false);
});

test("createProjectSchema: 빈 문자열 금액 → 0 으로 coerce", () => {
  const r = createProjectSchema.safeParse({
    title: "x",
    clientId: VALID_UUID,
    requiredSkillIds: [],
    businessAmountKrw: "",
    instructorFeeKrw: "",
  });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.businessAmountKrw, 0);
    assert.equal(r.data.instructorFeeKrw, 0);
  }
});

test("updateProjectSchema: expectedUpdatedAt 필수", () => {
  const r = updateProjectSchema.safeParse({
    title: "x",
    clientId: VALID_UUID,
    requiredSkillIds: [],
    businessAmountKrw: 0,
    instructorFeeKrw: 0,
    // expectedUpdatedAt 누락
  });
  assert.equal(r.success, false);
  if (!r.success) {
    const tokenErr = r.error.issues.find((i) =>
      i.path.includes("expectedUpdatedAt"),
    );
    assert.ok(tokenErr, "expectedUpdatedAt 누락 에러 존재");
  }
});

test("updateProjectSchema: expectedUpdatedAt 빈 문자열 거부", () => {
  const r = updateProjectSchema.safeParse({
    title: "x",
    clientId: VALID_UUID,
    requiredSkillIds: [],
    businessAmountKrw: 0,
    instructorFeeKrw: 0,
    expectedUpdatedAt: "",
  });
  assert.equal(r.success, false);
});

// SPEC-SKILL-ABSTRACT-001: requiredSkillIds max(9) 검증.
test("createProjectSchema: requiredSkillIds 9개 통과 (max)", () => {
  const ids = Array.from({ length: 9 }, (_, i) =>
    `30000000-0000-0000-0000-00000000000${i + 1}`,
  );
  const r = createProjectSchema.safeParse({
    title: "x",
    clientId: VALID_UUID,
    requiredSkillIds: ids,
    businessAmountKrw: 0,
    instructorFeeKrw: 0,
  });
  assert.equal(r.success, true);
});

test("createProjectSchema: requiredSkillIds 10개 거부 (max 9)", () => {
  const ids = Array.from({ length: 10 }, (_, i) =>
    `30000000-0000-0000-0000-${(i + 1).toString(16).padStart(12, "0")}`,
  );
  const r = createProjectSchema.safeParse({
    title: "x",
    clientId: VALID_UUID,
    requiredSkillIds: ids,
    businessAmountKrw: 0,
    instructorFeeKrw: 0,
  });
  assert.equal(r.success, false);
});

test("updateProjectSchema: 정상 — 동시성 토큰 포함", () => {
  const r = updateProjectSchema.safeParse({
    title: "x",
    clientId: VALID_UUID,
    requiredSkillIds: [],
    businessAmountKrw: 0,
    instructorFeeKrw: 0,
    expectedUpdatedAt: "2026-04-28T10:00:00.000Z",
  });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.expectedUpdatedAt, "2026-04-28T10:00:00.000Z");
  }
});
