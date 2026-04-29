// @MX:ANCHOR: SPEC-RECEIPT-001 §M1 REQ-RECEIPT-PDF-003 — 알고링크 사업자 정보 singleton.
// @MX:REASON: 영수증 PDF 발급 시 알고링크 정보의 단일 소스.
// @MX:WARN: 본 테이블은 항상 1행만 존재 (id=1 CHECK 강제). 직접 INSERT 시 CHECK 위반 가능.

import { pgTable, smallint, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const organizationInfo = pgTable(
  "organization_info",
  {
    id: smallint("id").primaryKey().default(1),
    name: text("name").notNull(),
    businessNumber: text("business_number").notNull(),
    representative: text("representative").notNull(),
    address: text("address").notNull(),
    contact: text("contact").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [check("organization_info_singleton_check", sql`id = 1`)],
);

export type OrganizationInfoRow = typeof organizationInfo.$inferSelect;
export type NewOrganizationInfo = typeof organizationInfo.$inferInsert;
