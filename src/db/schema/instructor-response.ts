// @MX:ANCHOR: SPEC-CONFIRM-001 §M1 REQ-CONFIRM-RESPONSES-001 — 강사 응답 통합 모델.
// @MX:REASON: 모든 응답 흐름(/me/inquiries, /me/assignments)이 본 테이블 통과. fan_in 매우 높음.
// @MX:WARN: project_id, proposal_inquiry_id 둘 중 하나만 NOT NULL (CHECK XOR 강제).
// @MX:REASON: source_kind discriminator + 두 nullable FK + CHECK XOR로 referential integrity 보장.
//
// SPEC-PROPOSAL-001 §M1 — proposal_inquiries 정의 확장 (CONFIRM-001 stub → SPEC §5.1 정식).
// 마이그레이션 20260429180010_proposal_inquiries_extend.sql이 ALTER TABLE로 컬럼 보강.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { instructors } from "./instructor";
import { projects } from "./project";
import { proposals } from "./proposal";

// SPEC-PROPOSAL-001 REQ-PROPOSAL-INQUIRY-002 — 정확히 4개 값.
export const inquiryStatus = pgEnum("inquiry_status", [
  "pending",
  "accepted",
  "declined",
  "conditional",
]);

// proposal_inquiries — SPEC-PROPOSAL-001 §5.1 정식 정의 (CONFIRM-001 stub 보강 완료).
export const proposalInquiries = pgTable(
  "proposal_inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id").references(() => proposals.id, {
      onDelete: "cascade",
    }),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    proposedTimeSlotStart: timestamp("proposed_time_slot_start", {
      withTimezone: true,
    }),
    proposedTimeSlotEnd: timestamp("proposed_time_slot_end", {
      withTimezone: true,
    }),
    questionNote: text("question_note"),
    status: inquiryStatus("status").notNull().default("pending"),
    conditionalNote: text("conditional_note"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedByUserId: uuid("responded_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_proposal_inquiries_instructor_status").on(
      t.instructorId,
      t.status,
    ),
    index("idx_proposal_inquiries_proposal_status").on(t.proposalId, t.status),
    uniqueIndex("uniq_proposal_inquiries_proposal_instructor")
      .on(t.proposalId, t.instructorId)
      .where(sql`proposal_id IS NOT NULL`),
  ],
);

export type ProposalInquiry = typeof proposalInquiries.$inferSelect;
export type NewProposalInquiry = typeof proposalInquiries.$inferInsert;

// instructor_responses — 통합 응답 모델 (HIGH-1 + MEDIUM-5)
export const instructorResponses = pgTable(
  "instructor_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceKind: text("source_kind").notNull(), // 'proposal_inquiry' | 'assignment_request'
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    proposalInquiryId: uuid("proposal_inquiry_id").references(
      () => proposalInquiries.id,
      { onDelete: "cascade" },
    ),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // 'accepted' | 'declined' | 'conditional' (no DEFAULT, MEDIUM-5)
    conditionalNote: text("conditional_note"),
    respondedAt: timestamp("responded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // partial UNIQUE 인덱스 (HIGH-1) — 마이그레이션의 WHERE 절 partial 인덱스를 Drizzle이 직접 표현 불가하므로
    // SQL fragment로 생성하여 introspection 만 정상화.
    index("idx_instructor_responses_by_instructor").on(t.instructorId, t.status),
    uniqueIndex("uniq_instructor_responses_assignment")
      .on(t.projectId, t.instructorId)
      .where(sql`project_id IS NOT NULL`),
    uniqueIndex("uniq_instructor_responses_inquiry")
      .on(t.proposalInquiryId, t.instructorId)
      .where(sql`proposal_inquiry_id IS NOT NULL`),
  ],
);

export type InstructorResponseRow = typeof instructorResponses.$inferSelect;
export type NewInstructorResponseRow = typeof instructorResponses.$inferInsert;
