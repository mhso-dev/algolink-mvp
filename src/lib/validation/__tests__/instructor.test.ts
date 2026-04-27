// SPEC-INSTRUCTOR-001 §2.3/§2.1 — 강사 등록 + 리스트 필터 zod 단위 테스트.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  instructorCreateSchema,
  instructorListFilterSchema,
} from "../instructor";

// ---------- instructorCreateSchema ----------

test("instructorCreateSchema: 정상 입력 통과", () => {
  const r = instructorCreateSchema.safeParse({
    nameKr: "최강사",
    nameEn: "Choi Teacher",
    email: "newteacher@algolink.test",
    phone: "010-1234-5678",
    skillIds: ["3b1f7c8a-9d2e-4f5a-b8c0-1234567890ab"],
  });
  assert.equal(r.success, true);
});

test("instructorCreateSchema: 이름 누락 → 한국어 에러", () => {
  const r = instructorCreateSchema.safeParse({
    nameKr: "",
    email: "x@y.com",
  });
  assert.equal(r.success, false);
  if (r.success) return;
  assert.match(r.error.issues[0]?.message ?? "", /이름을 입력해주세요/);
});

test("instructorCreateSchema: 이메일 형식 오류 → 한국어 에러", () => {
  const r = instructorCreateSchema.safeParse({
    nameKr: "홍",
    email: "not-an-email",
  });
  assert.equal(r.success, false);
  if (r.success) return;
  assert.match(
    r.error.issues[0]?.message ?? "",
    /올바른 이메일 형식을 입력해주세요/,
  );
});

test("instructorCreateSchema: 전화번호 빈 문자열 허용 (optional)", () => {
  const r = instructorCreateSchema.safeParse({
    nameKr: "홍",
    email: "x@y.com",
    phone: "",
  });
  assert.equal(r.success, true);
});

test("instructorCreateSchema: 전화번호 형식 오류 거부", () => {
  const r = instructorCreateSchema.safeParse({
    nameKr: "홍",
    email: "x@y.com",
    phone: "abc",
  });
  assert.equal(r.success, false);
});

test("instructorCreateSchema: skillIds 미지정 시 빈 배열 default", () => {
  const r = instructorCreateSchema.safeParse({
    nameKr: "홍",
    email: "x@y.com",
  });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.deepEqual(r.data.skillIds, []);
});

// ---------- instructorListFilterSchema ----------

test("instructorListFilterSchema: 빈 객체 → page=1, pageSize=20 default", () => {
  const r = instructorListFilterSchema.safeParse({});
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.page, 1);
  assert.equal(r.data.pageSize, 20);
});

test("instructorListFilterSchema: scoreMin > scoreMax → 한국어 에러", () => {
  const r = instructorListFilterSchema.safeParse({
    scoreMin: 4.5,
    scoreMax: 2.0,
  });
  assert.equal(r.success, false);
  if (r.success) return;
  assert.match(
    r.error.issues[0]?.message ?? "",
    /최소 만족도는 최대 만족도보다/,
  );
});

test("instructorListFilterSchema: scoreMin == scoreMax 통과", () => {
  const r = instructorListFilterSchema.safeParse({
    scoreMin: 3.0,
    scoreMax: 3.0,
  });
  assert.equal(r.success, true);
});

test("instructorListFilterSchema: sort 화이트리스트 외 거부", () => {
  const r = instructorListFilterSchema.safeParse({ sort: "evil_field" });
  assert.equal(r.success, false);
});

test("instructorListFilterSchema: page 0 거부", () => {
  const r = instructorListFilterSchema.safeParse({ page: 0 });
  assert.equal(r.success, false);
});

test("instructorListFilterSchema: pageSize 100 초과 거부", () => {
  const r = instructorListFilterSchema.safeParse({ pageSize: 500 });
  assert.equal(r.success, false);
});

test("instructorListFilterSchema: scoreMin/Max coerce (string from URL)", () => {
  const r = instructorListFilterSchema.safeParse({
    scoreMin: "1.5",
    scoreMax: "4.0",
  });
  assert.equal(r.success, true);
  if (!r.success) return;
  assert.equal(r.data.scoreMin, 1.5);
  assert.equal(r.data.scoreMax, 4.0);
});
