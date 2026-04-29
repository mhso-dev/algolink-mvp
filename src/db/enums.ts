// @MX:NOTE: SPEC-DB-001 §2 — PostgreSQL native enum 11종. type safety + RLS 헬퍼 모두 활용.
import { pgEnum } from "drizzle-orm/pg-core";

// 사용자 역할 — RLS 정책의 1차 분기 키.
export const userRole = pgEnum("user_role", ["instructor", "operator", "admin"]);

// 13단계 프로젝트 워크플로우 + SPEC-PAYOUT-002 instructor_withdrawn (총 14단계).
// REQ-DB001-PROJECT-WORKFLOW + REQ-PAYOUT002-EXCEPT-007.
// 추가/제거 시 ALTER TYPE ... ADD VALUE BEFORE/AFTER 사용 (무중단).
// instructor_withdrawn은 SPEC-PAYOUT-002 §M1 마이그레이션에서 추가됨 (비가역).
export const projectStatus = pgEnum("project_status", [
  "proposal",
  "contract_confirmed",
  "lecture_requested",
  "instructor_sourcing",
  "assignment_review",
  "assignment_confirmed",
  "education_confirmed",
  "recruiting",
  "progress_confirmed",
  "in_progress",
  "education_done",
  "settlement_in_progress",
  "task_done",
  "instructor_withdrawn",
]);

// SPEC-PAYOUT-002 §M1 — 강의 세션 상태 (4종).
// REQ-PAYOUT002-SESSIONS-002.
export const lectureSessionStatus = pgEnum("lecture_session_status", [
  "planned",
  "completed",
  "canceled",
  "rescheduled",
]);

// 프로젝트 유형 — 교육과 교재개발 동일 테이블에서 표현.
export const projectType = pgEnum("project_type", ["education", "material_development"]);

// 정산 흐름 — 기업/정부/고객 직접 정산.
// SPEC-RECEIPT-001 §M1: client_direct 추가 (6-2 흐름, 원천세율 3.30/8.80 허용).
export const settlementFlow = pgEnum("settlement_flow", [
  "corporate",
  "government",
  "client_direct",
]);

// 정산 상태.
export const settlementStatus = pgEnum("settlement_status", [
  "pending",
  "requested",
  "paid",
  "held",
]);

// 일정 종류 — system_lecture/unavailable만 EXCLUSION 충돌 검사 대상.
export const scheduleKind = pgEnum("schedule_kind", [
  "system_lecture",
  "personal",
  "unavailable",
]);

// 메모/일정 노출 범위.
export const audience = pgEnum("audience", ["instructor", "internal"]);

// 다형성 메모 부착 대상.
export const entityType = pgEnum("entity_type", ["project", "instructor", "client"]);

// 인앱 알림 종류 (SPEC §2.10 REQ-DB001-NOTIFICATIONS-TYPE).
// SPEC-PROJECT-001 §5: assignment_request 추가 (ADD VALUE IF NOT EXISTS).
// SPEC-RECEIPT-001 §M1: receipt_issued 추가.
export const notificationType = pgEnum("notification_type", [
  "assignment_overdue",
  "schedule_conflict",
  "low_satisfaction_assignment",
  "dday_unprocessed",
  "settlement_requested",
  "assignment_request",
  "receipt_issued",
]);

// SPEC-SKILL-ABSTRACT-001: 강사 기술 분류 enum 제거 (3-tier 분류, 숙련도).
// 강사 기술 분류는 9개 추상 카테고리(단일 레벨) + 보유=1/미보유=0 binary 매칭으로 단순화.
