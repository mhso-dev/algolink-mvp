// @MX:NOTE: SPEC-DB-001 §2.2 REQ-DB001-PII-LOG — pgcrypto 마이그레이션이 먼저 테이블을 생성하지만,
// Drizzle에서도 타입 추론을 위해 동일 스키마를 정의해 둔다 (CREATE IF NOT EXISTS이므로 충돌 없음).
import { pgTable, uuid, timestamp, index } from "drizzle-orm/pg-core";

export const piiAccessLog = pgTable(
  "pii_access_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callerId: uuid("caller_id"),
    targetInstructorId: uuid("target_instructor_id"),
    accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_pii_access_log_caller").on(t.callerId),
    index("idx_pii_access_log_target").on(t.targetInstructorId),
    index("idx_pii_access_log_accessed_at").on(t.accessedAt),
  ],
);

export type PiiAccessLog = typeof piiAccessLog.$inferSelect;
