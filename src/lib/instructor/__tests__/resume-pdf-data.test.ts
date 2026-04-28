// SPEC-ME-001 §2.2 REQ-ME-RESUME-PDF — PDF 데이터 변환 + 마스킹 + 파일명 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildResumePdfSections,
  buildResumeFilename,
  maskBasicForPdf,
  type ResumePdfBasic,
} from "../resume-pdf-data";

test("buildResumePdfSections: 학력 매핑", () => {
  const out = buildResumePdfSections({
    educations: [{ school: "서울대학교", major: "컴퓨터공학", degree: "학사", start_date: "2018-03-02", end_date: "2022-02-25", description: "성적 우수 졸업" }],
    workExperiences: [], teachingExperiences: [], certifications: [], publications: [], instructorProjects: [], otherActivities: [],
  });
  assert.equal(out.educations.length, 1);
  const row = out.educations[0]!;
  assert.equal(row.title, "서울대학교");
  assert.equal(row.subtitle, "컴퓨터공학 · 학사");
  assert.equal(row.period, "2018-03 ~ 2022-02");
  assert.equal(row.description, "성적 우수 졸업");
});

test("buildResumePdfSections: 경력 — end_date 없으면 재직중", () => {
  const out = buildResumePdfSections({
    educations: [], workExperiences: [{ company: "Algolink", position: "Tech Lead", start_date: "2024-01-01", end_date: null }],
    teachingExperiences: [], certifications: [], publications: [], instructorProjects: [], otherActivities: [],
  });
  const row = out.workExperiences[0]!;
  assert.equal(row.title, "Algolink");
  assert.equal(row.subtitle, "Tech Lead");
  assert.equal(row.period, "2024-01 ~ 재직중");
});

test("buildResumePdfSections: 자격", () => {
  const out = buildResumePdfSections({
    educations: [], workExperiences: [], teachingExperiences: [],
    certifications: [{ name: "AWS Solutions Architect", issuer: "Amazon", issued_date: "2023-05-10", expires_date: "2026-05-10" }],
    publications: [], instructorProjects: [], otherActivities: [],
  });
  const row = out.certifications[0]!;
  assert.equal(row.title, "AWS Solutions Architect");
  assert.equal(row.subtitle, "Amazon");
  assert.equal(row.period, "2023-05 ~ 2026-05");
});

test("buildResumePdfSections: null/undefined graceful", () => {
  const out = buildResumePdfSections({
    educations: [{ school: "X", major: null, degree: undefined, start_date: null, end_date: null }],
    workExperiences: [], teachingExperiences: [], certifications: [], publications: [], instructorProjects: [], otherActivities: [],
  });
  const row = out.educations[0]!;
  assert.equal(row.title, "X");
  assert.equal(row.subtitle, "");
  assert.equal(row.period, "");
});

const BASIC_RAW: ResumePdfBasic = {
  nameKr: "홍길동", nameEn: "Hong Gildong", nameHanja: "洪吉童",
  birthDate: "1990-01-01", email: "hong@algolink.kr", phone: "010-1234-5678",
  address: "서울특별시 강남구 테헤란로 123 4층",
};

test("maskBasicForPdf: maskPii=false → 원본", () => {
  const out = maskBasicForPdf(BASIC_RAW, false);
  assert.deepEqual(out, BASIC_RAW);
});

test("maskBasicForPdf: maskPii=true → 마스킹", () => {
  const out = maskBasicForPdf(BASIC_RAW, true);
  assert.equal(out.email, "ho***@algolink.kr");
  assert.equal(out.phone, "010-****-5678");
  assert.equal(out.address, "서울특별시 강남구 ***");
  assert.equal(out.birthDate, "1990-**-**");
  assert.equal(out.nameKr, "홍길동");
  assert.equal(out.nameHanja, "洪吉童");
  assert.equal(out.nameEn, "Hong Gildong");
});

test("maskBasicForPdf: maskPii=true 빈 입력 → 빈 출력", () => {
  const empty: ResumePdfBasic = { nameKr: "", nameEn: "", nameHanja: "", birthDate: "", email: "", phone: "", address: "" };
  const out = maskBasicForPdf(empty, true);
  assert.equal(out.email, "");
  assert.equal(out.phone, "");
  assert.equal(out.address, "");
  assert.equal(out.birthDate, "");
});

test("buildResumeFilename: 기본 포맷", () => {
  const fn = buildResumeFilename("홍길동", new Date("2026-04-28T00:00:00Z"));
  assert.match(fn, /^이력서_홍길동_\d{8}\.pdf$/);
});

test("buildResumeFilename: 특수문자 → 언더스코어", () => {
  const fn = buildResumeFilename("홍 길/동?", new Date("2026-04-28T12:00:00Z"));
  assert.match(fn, /^이력서_홍_길_동__\d{8}\.pdf$/);
});

test("buildResumeFilename: nameKr 빈 → '강사'", () => {
  const fn = buildResumeFilename("", new Date("2026-04-28T12:00:00Z"));
  assert.match(fn, /^이력서_강사_\d{8}\.pdf$/);
});
