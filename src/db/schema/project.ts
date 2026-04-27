// @MX:ANCHOR: SPEC-DB-001 §2.6 REQ-DB001-PROJECT-WORKFLOW — 13단계 워크플로우.
// @MX:REASON: 모든 정산/일정/알림이 본 테이블 참조. fan_in 매우 높음.
// @MX:WARN: status 변경은 트리거가 project_status_history에 자동 기록.
// @MX:REASON: 상태 추적성 확보 (REQ-DB001-PROJECT-STATUS-HISTORY).
import {
  pgTable,
  uuid,
  text,
  bigint,
  date,
  timestamp,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projectStatus, projectType } from "../enums";
import { clients } from "./client";
import { instructors } from "./instructor";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    projectType: projectType("project_type").notNull().default("education"),
    status: projectStatus("status").notNull().default("proposal"),

    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    operatorId: uuid("operator_id"), // FK to users.id (운영자)
    instructorId: uuid("instructor_id").references((): AnyPgColumn => instructors.id, {
      onDelete: "set null",
    }), // 배정 전 NULL

    // 일정 메타
    educationStartAt: timestamp("education_start_at", { withTimezone: true }),
    educationEndAt: timestamp("education_end_at", { withTimezone: true }),
    scheduledAt: date("scheduled_at"),

    // 금액 (KRW 원 단위, bigint)
    businessAmountKrw: bigint("business_amount_krw", { mode: "number" }).notNull().default(0),
    instructorFeeKrw: bigint("instructor_fee_krw", { mode: "number" }).notNull().default(0),
    // GENERATED ALWAYS — 직접 UPDATE 불가.
    marginKrw: bigint("margin_krw", { mode: "number" }).generatedAlwaysAs(
      sql`business_amount_krw - instructor_fee_krw`,
    ),

    // 정산 흐름 hint (실제 정산 row는 settlements 테이블)
    settlementFlowHint: text("settlement_flow_hint"), // 'corporate' | 'government'

    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [
    index("idx_projects_status").on(t.status),
    index("idx_projects_client").on(t.clientId),
    index("idx_projects_instructor").on(t.instructorId),
    index("idx_projects_operator").on(t.operatorId),
    index("idx_projects_scheduled").on(t.scheduledAt),
    index("idx_projects_deleted").on(t.deletedAt),
  ],
);

// 상태 변경 이력 — 트리거가 자동 INSERT (000050_triggers.sql).
export const projectStatusHistory = pgTable(
  "project_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromStatus: projectStatus("from_status"),
    toStatus: projectStatus("to_status").notNull(),
    changedBy: uuid("changed_by"), // nullable (시스템 변경 허용)
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_project_status_history_project").on(t.projectId),
    index("idx_project_status_history_changed_at").on(t.changedAt.desc()),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
