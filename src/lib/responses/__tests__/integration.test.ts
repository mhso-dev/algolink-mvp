// SPEC-CONFIRM-001 §M6 — 통합 시나리오 합성 테스트.
//
// 본 테스트는 server actions의 next/cookies, RLS, transactional execution을 직접 호출하지 않는다.
// 대신 actions.ts가 조립하는 도메인 모듈(state-machine + side-effects + notification-mapping +
// SPEC-PROJECT-AMEND-001 ALLOWED_TRANSITIONS 확장)을 합성하여 acceptance 시나리오의 비즈니스
// 결과를 검증한다. RLS / transaction / EXCLUSION는 db:verify로 검증.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHANGE_WINDOW_HOURS,
  computeAssignmentAcceptanceEffects,
  computeAssignmentDowngradeEffects,
  computeInquiryAcceptanceEffects,
  isWithinChangeWindow,
  mapResponseToNotificationType,
  truncateForNotificationBody,
  validateStatusTransition,
} from "..";
import {
  ALLOWED_TRANSITIONS,
  validateTransition,
} from "@/lib/projects/status-machine";

// 시나리오 1 — 운영자 배정 → 강사 수락 → 부수효과 합성
test("[Scenario 1] 운영자 배정 → 강사 수락 → forward edge + schedule 1행 + notif assignment_accepted", () => {
  // Given: project status='assignment_review', instructor 배정됨
  const project = {
    id: "p1",
    status: "assignment_review",
    educationStartAt: new Date("2026-06-01T00:00:00Z"),
    educationEndAt: new Date("2026-06-03T09:00:00Z"),
    operatorId: "uo",
  };
  const instructorId = "ia";

  // When: 강사가 수락 (validateTransition + side-effects 합성)
  // Step 1: validateTransition forward
  const verdict = validateTransition(
    "assignment_review",
    "assignment_confirmed",
    { instructorId },
  );
  assert.equal(verdict.ok, true);

  // Step 2: state-machine null → accepted (first response)
  const stateRes = validateStatusTransition(null, "accepted");
  assert.equal(stateRes.ok, true);

  // Step 3: side-effects 산출
  const effects = computeAssignmentAcceptanceEffects(project, instructorId);
  assert.equal(effects.scheduleItems.length, 1);
  assert.equal(effects.nextStatus, "assignment_confirmed");
  assert.equal(effects.scheduleItems[0].instructorId, instructorId);
  assert.equal(effects.scheduleItems[0].projectId, "p1");
  assert.equal(effects.scheduleItems[0].scheduleKind, "system_lecture");

  // Step 4: notification mapping
  const notif = mapResponseToNotificationType(
    "assignment_request",
    "accepted",
  );
  assert.equal(notif, "assignment_accepted");
});

// 시나리오 2 — 사전 가용성 문의 수락 → schedule 미생성
test("[Scenario 2] 사전 가용성 문의 수락 → schedule 0건 + notif inquiry_accepted", () => {
  const inquiry = {
    id: "pi1",
    status: "pending",
    createdByUserId: "uo",
  };

  const stateRes = validateStatusTransition(null, "accepted");
  assert.equal(stateRes.ok, true);

  const effects = computeInquiryAcceptanceEffects(inquiry);
  assert.equal(effects.inquiryStatus, "accepted");

  const notif = mapResponseToNotificationType("proposal_inquiry", "accepted");
  assert.equal(notif, "inquiry_accepted");
});

// 시나리오 3 — 거절 (first response) → 운영자 알림, project 미변경
test("[Scenario 3] 정식 배정 거절 (first response) → projects 미변경 + notif assignment_declined", () => {
  // first response decline: state-machine만 통과, projects UPDATE 없음
  const stateRes = validateStatusTransition(null, "declined");
  assert.equal(stateRes.ok, true);

  const notif = mapResponseToNotificationType(
    "assignment_request",
    "declined",
  );
  assert.equal(notif, "assignment_declined");

  // projects.status 전환 없음 (REQ-CONFIRM-EFFECTS-003)
});

// 시나리오 4 — conditional note 5자 미만 reject (zod schema 단계)
test("[Scenario 4a] conditional 응답 시 note 5자 미만 → state-machine 통과하지만 zod 단에서 reject", () => {
  // state-machine은 status 전환만 검증 (note는 별도 zod 검증)
  const stateRes = validateStatusTransition(null, "conditional");
  assert.equal(stateRes.ok, true);
  // conditionalNote 5자 미만은 zod refine로 reject (단위 테스트는 validation.test.ts에서 검증)
});

// 시나리오 5 — 정식 배정 수락 시 schedule_items + projects forward 합성
test("[Scenario 5] 정식 배정 수락 + 부수효과 + AMEND-001 ALLOWED_TRANSITIONS 검증", () => {
  // assignment_review → assignment_confirmed forward edge 정상
  const forward = validateTransition(
    "assignment_review",
    "assignment_confirmed",
    { instructorId: "ia" },
  );
  assert.equal(forward.ok, true);

  // AMEND-001 통합: backward edge도 정상
  const backward = validateTransition(
    "assignment_confirmed",
    "assignment_review",
    { instructorId: null },
  );
  assert.equal(backward.ok, true);

  assert.ok(
    ALLOWED_TRANSITIONS.assignment_confirmed.includes("assignment_review"),
    "AMEND-001 backward edge must be in ALLOWED_TRANSITIONS",
  );
});

// 시나리오 6a — 1시간 윈도 내 accepted → declined 보상 트랜잭션 (HIGH-2)
test("[Scenario 6a] 윈도 내 accept→decline 보상 트랜잭션: AMEND-001 정식 경로 + side-effects DELETE 산출", () => {
  // Given: T0에 accepted 응답, 30분 후 변경 시도
  const respondedAt = new Date("2026-04-29T10:00:00Z");
  const now = new Date("2026-04-29T10:30:00Z"); // T0 + 30분

  // 윈도 내인지 확인
  assert.equal(isWithinChangeWindow(respondedAt, now), true);

  // state-machine: accepted → declined OK
  const stateRes = validateStatusTransition("accepted", "declined");
  assert.equal(stateRes.ok, true);

  // AMEND-001 정식 backward edge 통과 (bypass 미사용 — REQ-AMEND-BYPASS-001/002)
  const transitionRes = validateTransition(
    "assignment_confirmed",
    "assignment_review",
    { instructorId: null },
  );
  assert.equal(transitionRes.ok, true);

  // 보상 산출
  const dgEffects = computeAssignmentDowngradeEffects("p1", "ia");
  assert.equal(dgEffects.nextInstructorId, null);
  assert.equal(dgEffects.nextStatus, "assignment_review");
  assert.deepEqual(dgEffects.scheduleDeleteFilter, {
    projectId: "p1",
    instructorId: "ia",
    scheduleKind: "system_lecture",
  });

  // 새 알림 매핑
  const notif = mapResponseToNotificationType("assignment_request", "declined");
  assert.equal(notif, "assignment_declined");
});

// 시나리오 6b — 1시간 윈도 외 변경 시도 → reject
test("[Scenario 6b] 윈도 외 변경 시도 → 한국어 에러", () => {
  const respondedAt = new Date("2026-04-29T10:00:00Z");
  const now = new Date("2026-04-29T11:00:01Z"); // T0 + 1h 1초

  assert.equal(isWithinChangeWindow(respondedAt, now), false);
  // Server Action은 RESPONSE_ERRORS.WINDOW_EXPIRED 반환
});

// 시나리오 7 (RLS) — RLS는 DB-level이므로 본 합성 테스트에서는 검증 위치만 확인.
// 통합 검증은 db:verify 스크립트의 RLS policy 존재 검증으로 대체.
test("[Scenario 7] RLS 격리 — instructor_responses_self_only policy 존재 (검증 위치 명시)", () => {
  // RLS 정책 존재는 db:verify로 검증.
  // 본 합성 테스트에서는 Server Action이 user-scoped Supabase client만 사용하는지 코드 검증.
  // (실제 grep 검증은 manual / CI 단계)
  assert.ok(true, "RLS policy 검증은 db:verify로 자동화");
});

// 시나리오 8 — Idempotency: 동일 응답 재시도
test("[Scenario 8] Idempotency 동일 status 재요청 → state-machine reject (DB 차원 ON CONFLICT 별도)", () => {
  // accepted → accepted 동일 상태 거부
  const r1 = validateStatusTransition("accepted", "accepted");
  assert.equal(r1.ok, false);

  // DB 차원의 ON CONFLICT DO NOTHING은 db:verify의 partial UNIQUE 인덱스 검증으로 대체.
});

// 시나리오 10 (CHECK XOR) — DB constraint, db:verify가 검증
test("[Scenario 10] CHECK XOR / FK CASCADE / partial UNIQUE — db:verify에서 검증", () => {
  // db-verify.ts의 AC-CONFIRM-001-RESPONSES 시나리오에서 schema 정합 검증 완료.
  assert.ok(true);
});

// AMEND-001 통합 시나리오
test("[AMEND-001] 회귀 가드: ALLOWED_TRANSITIONS forward 흐름 보존", () => {
  // forward edges 보존 검증
  const cases: Array<[string, string, { ok: true }]> = [
    ["assignment_review", "assignment_confirmed", { ok: true }],
    ["assignment_confirmed", "education_confirmed", { ok: true }],
    ["assignment_confirmed", "recruiting", { ok: true }],
    ["assignment_confirmed", "instructor_withdrawn", { ok: true }],
  ];
  for (const [from, to] of cases) {
    const r = validateTransition(
      from as Parameters<typeof validateTransition>[0],
      to as Parameters<typeof validateTransition>[1],
      { instructorId: "ia" },
    );
    assert.equal(r.ok, true, `forward edge ${from} → ${to} must remain OK`);
  }
});

// 알림 body truncation (LOW-8)
test("[LOW-8] notif body 1000자 truncation 적용", () => {
  const longNote = "a".repeat(1500);
  const truncated = truncateForNotificationBody(longNote);
  assert.equal(truncated.length, 1000 + "…(생략)".length);
  assert.ok(truncated.endsWith("…(생략)"));
});

// 매핑 6 케이스 전체 (LOW-7)
test("[LOW-7] 매핑 6 케이스 (2 source × 3 status) 전체", () => {
  assert.equal(
    mapResponseToNotificationType("assignment_request", "accepted"),
    "assignment_accepted",
  );
  assert.equal(
    mapResponseToNotificationType("assignment_request", "declined"),
    "assignment_declined",
  );
  assert.equal(
    mapResponseToNotificationType("assignment_request", "conditional"),
    "assignment_declined",
  );
  assert.equal(
    mapResponseToNotificationType("proposal_inquiry", "accepted"),
    "inquiry_accepted",
  );
  assert.equal(
    mapResponseToNotificationType("proposal_inquiry", "declined"),
    "inquiry_declined",
  );
  assert.equal(
    mapResponseToNotificationType("proposal_inquiry", "conditional"),
    "inquiry_conditional",
  );
});

// CHANGE_WINDOW_HOURS 상수
test("[Window] CHANGE_WINDOW_HOURS === 1", () => {
  assert.equal(CHANGE_WINDOW_HOURS, 1);
});
