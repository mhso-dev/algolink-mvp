// SPEC-ME-001 §2.2 REQ-ME-RESUME — M2 zod 스키마 단위 테스트.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  educationInputSchema,
  workExperienceInputSchema,
  certificationInputSchema,
  teachingExperienceInputSchema,
  instructorProjectInputSchema,
  publicationInputSchema,
  otherActivityInputSchema,
  basicInfoInputSchema,
  skillUpdateInputSchema,
} from "../instructor";

// ---------- educationInputSchema ----------

test("educationInputSchema: 정상 입력 통과", () => {
  const r = educationInputSchema.safeParse({
    school: "서울대학교",
    major: "컴퓨터공학",
    degree: "학사",
    startDate: "2010-03",
    endDate: "2014-02",
  });
  assert.equal(r.success, true);
});

test("educationInputSchema: school 누락 → 한국어 에러", () => {
  const r = educationInputSchema.safeParse({ school: "" });
  assert.equal(r.success, false);
  if (!r.success) {
    assert.match(r.error.issues[0]?.message ?? "", /학교명/);
  }
});

test("educationInputSchema: 잘못된 날짜 형식 거부", () => {
  const r = educationInputSchema.safeParse({
    school: "서울대",
    startDate: "2010/03",
  });
  assert.equal(r.success, false);
});

test("educationInputSchema: optional 필드 미지정 통과", () => {
  const r = educationInputSchema.safeParse({ school: "고려대" });
  assert.equal(r.success, true);
});

// ---------- workExperienceInputSchema ----------

test("workExperienceInputSchema: company 필수", () => {
  const r = workExperienceInputSchema.safeParse({ company: "" });
  assert.equal(r.success, false);
  if (!r.success) assert.match(r.error.issues[0]?.message ?? "", /회사명/);
});

test("workExperienceInputSchema: 정상 입력", () => {
  const r = workExperienceInputSchema.safeParse({
    company: "네이버",
    position: "백엔드 개발자",
    startDate: "2014-03",
    endDate: "2020-12",
  });
  assert.equal(r.success, true);
});

// ---------- teachingExperienceInputSchema ----------

test("teachingExperienceInputSchema: title 필수", () => {
  const r = teachingExperienceInputSchema.safeParse({ title: "" });
  assert.equal(r.success, false);
  if (!r.success) assert.match(r.error.issues[0]?.message ?? "", /강의명/);
});

test("teachingExperienceInputSchema: 정상 입력", () => {
  const r = teachingExperienceInputSchema.safeParse({
    title: "Spring Boot 입문",
    organization: "삼성전자",
    startDate: "2023-05",
    endDate: "2023-06",
  });
  assert.equal(r.success, true);
});

// ---------- certificationInputSchema ----------

test("certificationInputSchema: name 필수", () => {
  const r = certificationInputSchema.safeParse({ name: "" });
  assert.equal(r.success, false);
});

test("certificationInputSchema: 정상 입력 + expires", () => {
  const r = certificationInputSchema.safeParse({
    name: "정보처리기사",
    issuer: "한국산업인력공단",
    issuedDate: "2020-05-15",
    expiresDate: "2025-05-15",
  });
  assert.equal(r.success, true);
});

// ---------- publicationInputSchema ----------

test("publicationInputSchema: title 필수", () => {
  const r = publicationInputSchema.safeParse({ title: "" });
  assert.equal(r.success, false);
  if (!r.success) assert.match(r.error.issues[0]?.message ?? "", /도서명/);
});

test("publicationInputSchema: 정상 입력", () => {
  const r = publicationInputSchema.safeParse({
    title: "TypeScript 마스터하기",
    publisher: "한빛미디어",
    isbn: "978-89-1234-567-8",
  });
  assert.equal(r.success, true);
});

// ---------- instructorProjectInputSchema ----------

test("instructorProjectInputSchema: title 필수", () => {
  const r = instructorProjectInputSchema.safeParse({ title: "" });
  assert.equal(r.success, false);
});

test("instructorProjectInputSchema: 정상 입력", () => {
  const r = instructorProjectInputSchema.safeParse({
    title: "AI 챗봇 개발",
    role: "프론트엔드 리드",
  });
  assert.equal(r.success, true);
});

// ---------- otherActivityInputSchema ----------

test("otherActivityInputSchema: title 필수", () => {
  const r = otherActivityInputSchema.safeParse({ title: "" });
  assert.equal(r.success, false);
  if (!r.success) assert.match(r.error.issues[0]?.message ?? "", /활동명/);
});

test("otherActivityInputSchema: 정상 입력", () => {
  const r = otherActivityInputSchema.safeParse({
    title: "FE 컨퍼런스 발표",
    category: "발표",
    activityDate: "2024-10-15",
  });
  assert.equal(r.success, true);
});

// ---------- basicInfoInputSchema ----------

test("basicInfoInputSchema: nameKr 필수", () => {
  const r = basicInfoInputSchema.safeParse({ nameKr: "" });
  assert.equal(r.success, false);
  if (!r.success) assert.match(r.error.issues[0]?.message ?? "", /이름/);
});

test("basicInfoInputSchema: optional 빈 값 허용", () => {
  const r = basicInfoInputSchema.safeParse({
    nameKr: "홍길동",
    nameHanja: "",
    nameEn: "",
    birthDate: "",
    email: "",
    phone: "",
    address: "",
  });
  assert.equal(r.success, true);
});

test("basicInfoInputSchema: 잘못된 이메일 거부", () => {
  const r = basicInfoInputSchema.safeParse({
    nameKr: "홍길동",
    email: "not-email",
  });
  assert.equal(r.success, false);
});

test("basicInfoInputSchema: 잘못된 birthDate 거부", () => {
  const r = basicInfoInputSchema.safeParse({
    nameKr: "홍길동",
    birthDate: "1990/01/01",
  });
  assert.equal(r.success, false);
});

test("basicInfoInputSchema: 잘못된 phone 거부", () => {
  const r = basicInfoInputSchema.safeParse({
    nameKr: "홍길동",
    phone: "abc",
  });
  assert.equal(r.success, false);
});

// ---------- skillUpdateInputSchema ----------

test("skillUpdateInputSchema: 정상 추가", () => {
  const r = skillUpdateInputSchema.safeParse({
    skillId: "3b1f7c8a-9d2e-4f5a-b8c0-1234567890ab",
    proficiency: "advanced",
  });
  assert.equal(r.success, true);
});

test("skillUpdateInputSchema: proficiency null (삭제 신호)", () => {
  const r = skillUpdateInputSchema.safeParse({
    skillId: "3b1f7c8a-9d2e-4f5a-b8c0-1234567890ab",
    proficiency: null,
  });
  assert.equal(r.success, true);
});

test("skillUpdateInputSchema: 잘못된 uuid 거부", () => {
  const r = skillUpdateInputSchema.safeParse({
    skillId: "not-uuid",
    proficiency: "beginner",
  });
  assert.equal(r.success, false);
});

test("skillUpdateInputSchema: 잘못된 proficiency 거부", () => {
  const r = skillUpdateInputSchema.safeParse({
    skillId: "3b1f7c8a-9d2e-4f5a-b8c0-1234567890ab",
    proficiency: "guru",
  });
  assert.equal(r.success, false);
});
