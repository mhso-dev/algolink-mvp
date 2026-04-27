// @MX:ANCHOR: SPEC-DB-001 §2.8 REQ-DB001-SETTLEMENT — corporate/government 정산.
// @MX:REASON: CHECK 제약(원천세율 화이트리스트) + GENERATED 컬럼이 비즈니스 규칙 강제.
// @MX:WARN: withholding_tax_rate은 numeric(5,2)만 허용 — 0/3.30/8.80 외 값 INSERT 거부.
// @MX:REASON: 세무법상 적용 가능한 세율이 고정.
import {
  pgTable,
  uuid,
  text,
  bigint,
  numeric,
  boolean,
  date,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { settlementFlow, settlementStatus } from "../enums";
import { projects } from "./project";
import { instructors } from "./instructor";

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "restrict" }),

    settlementFlow: settlementFlow("settlement_flow").notNull(),
    status: settlementStatus("status").notNull().default("pending"),

    // 금액
    businessAmountKrw: bigint("business_amount_krw", { mode: "number" }).notNull(),
    instructorFeeKrw: bigint("instructor_fee_krw", { mode: "number" }).notNull(),

    // 원천세율 — corporate=0, government ∈ {3.30, 8.80}.
    withholdingTaxRate: numeric("withholding_tax_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),

    // GENERATED 컬럼 — 직접 UPDATE 불가.
    profitKrw: bigint("profit_krw", { mode: "number" }).generatedAlwaysAs(
      sql`business_amount_krw - instructor_fee_krw`,
    ),
    withholdingTaxAmountKrw: bigint("withholding_tax_amount_krw", {
      mode: "number",
    }).generatedAlwaysAs(
      sql`floor(instructor_fee_krw * withholding_tax_rate / 100)::bigint`,
    ),

    // 입금/송금 기록 (REQ-DB001-SETTLEMENT-DATES)
    paymentReceivedAt: timestamp("payment_received_at", { withTimezone: true }),
    payoutSentAt: timestamp("payout_sent_at", { withTimezone: true }),
    taxInvoiceIssued: boolean("tax_invoice_issued").notNull().default(false),
    taxInvoiceIssuedAt: date("tax_invoice_issued_at"),

    notes: text("notes"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [
    // REQ-DB001-SETTLEMENT-WITHHOLDING — 흐름 ↔ 세율 화이트리스트 강제.
    check(
      "settlements_withholding_rate_check",
      sql`(
        (settlement_flow = 'corporate' AND withholding_tax_rate = 0)
        OR
        (settlement_flow = 'government' AND withholding_tax_rate IN (3.30, 8.80))
      )`,
    ),
    index("idx_settlements_project").on(t.projectId),
    index("idx_settlements_instructor").on(t.instructorId),
    index("idx_settlements_status").on(t.status),
    index("idx_settlements_flow").on(t.settlementFlow),
    index("idx_settlements_deleted").on(t.deletedAt),
  ],
);

// 상태 이력 (트리거 자동 기록).
export const settlementStatusHistory = pgTable(
  "settlement_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    settlementId: uuid("settlement_id")
      .notNull()
      .references(() => settlements.id, { onDelete: "cascade" }),
    fromStatus: settlementStatus("from_status"),
    toStatus: settlementStatus("to_status").notNull(),
    changedBy: uuid("changed_by"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_settlement_status_history_settlement").on(t.settlementId),
    index("idx_settlement_status_history_changed_at").on(t.changedAt.desc()),
  ],
);

export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
