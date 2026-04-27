// @MX:NOTE: SPEC-DB-001 §2 — PostgreSQL native enum 11종. type safety + RLS 헬퍼 모두 활용.
import { pgEnum } from "drizzle-orm/pg-core";

// 사용자 역할 — RLS 정책의 1차 분기 키.
export const userRole = pgEnum("user_role", ["instructor", "operator", "admin"]);

// 13단계 프로젝트 워크플로우 (SPEC §2.6 REQ-DB001-PROJECT-WORKFLOW).
// 추가/제거 시 ALTER TYPE ... ADD VALUE BEFORE/AFTER 사용 (무중단).
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
]);

// 프로젝트 유형 — 교육과 교재개발 동일 테이블에서 표현.
export const projectType = pgEnum("project_type", ["education", "material_development"]);

// 정산 흐름 — 기업/정부에 따라 원천세율 분기.
export const settlementFlow = pgEnum("settlement_flow", ["corporate", "government"]);

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
export const notificationType = pgEnum("notification_type", [
  "assignment_overdue",
  "schedule_conflict",
  "low_satisfaction_assignment",
  "dday_unprocessed",
  "settlement_requested",
  "assignment_request",
]);

// 강사-기술 매핑 난이도.
export const proficiency = pgEnum("proficiency", [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
]);

// 기술 분류 3-tier 계층.
export const skillTier = pgEnum("skill_tier", ["large", "medium", "small"]);
