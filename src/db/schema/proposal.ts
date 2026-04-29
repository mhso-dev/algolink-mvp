// @MX:ANCHOR: SPEC-PROPOSAL-001 §M1 REQ-PROPOSAL-ENTITY-001 — 제안서 엔티티 + status 워크플로우.
// @MX:REASON: 모든 영업 흐름(/proposals, dispatch, convert)이 본 테이블 통과. fan_in 매우 높음.
// @MX:WARN: status 변경은 status-machine.ts validateProposalTransition 통과 필수.
// @MX:REASON: draft → submitted/withdrawn, submitted → won/lost/withdrawn 외 전환 거부.
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  date,
  timestamp,
  index,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { clients } from "./client";
import { skillCategories } from "./skill-taxonomy";
import { projects } from "./project";

// SPEC-PROPOSAL-001 REQ-PROPOSAL-ENTITY-002 — 정확히 5개 값.
export const proposalStatus = pgEnum("proposal_status", [
  "draft",
  "submitted",
  "won",
  "lost",
  "withdrawn",
]);

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(), // CHECK length 1~200 (DB)
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    operatorId: uuid("operator_id").notNull(), // FK to users.id

    proposedPeriodStart: date("proposed_period_start"),
    proposedPeriodEnd: date("proposed_period_end"),
    proposedBusinessAmountKrw: bigint("proposed_business_amount_krw", {
      mode: "number",
    }),
    proposedHourlyRateKrw: bigint("proposed_hourly_rate_krw", {
      mode: "number",
    }),
    notes: text("notes"),

    status: proposalStatus("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    convertedProjectId: uuid("converted_project_id").references(
      (): AnyPgColumn => projects.id,
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_proposals_status").on(t.status),
    index("idx_proposals_client").on(t.clientId),
    index("idx_proposals_operator").on(t.operatorId),
  ],
);

export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;

// SPEC-PROPOSAL-001 REQ-PROPOSAL-ENTITY-003 — N:M junction (project_required_skills mirror).
export const proposalRequiredSkills = pgTable(
  "proposal_required_skills",
  {
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skillCategories.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.proposalId, t.skillId] }),
    index("idx_proposal_required_skills_skill").on(t.skillId),
  ],
);

export type ProposalRequiredSkill = typeof proposalRequiredSkills.$inferSelect;
export type NewProposalRequiredSkill =
  typeof proposalRequiredSkills.$inferInsert;
