// @MX:ANCHOR: SPEC-DB-001 §2.3 REQ-DB001-INSTRUCTOR — 강사 기본 프로필.
// @MX:REASON: 강사 도메인의 루트 테이블, 모든 resume sub-domain과 instructor_skills의 부모.
// PII 4종(주민번호/계좌/사업자/원천세율)은 bytea, 나머지는 평문.
// @MX:WARN: PII 컬럼 raw SELECT는 RLS로 차단되며 app.decrypt_pii() 경유만 허용.
// @MX:REASON: 평문 PII가 노출되면 개인정보보호법 위반.
import { pgTable, uuid, text, date, timestamp, index } from "drizzle-orm/pg-core";
import { bytea } from "../types";
import { files } from "./files";

export const instructors = pgTable(
  "instructors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // user_id는 Supabase Auth 가입 전 외부 강사도 등록 가능하므로 nullable.
    // RLS instructors_self_select는 user_id IS NULL이면 매칭하지 않음 → operator만 접근.
    userId: uuid("user_id"), // FK to users.id (제약은 마이그레이션에서)
    nameKr: text("name_kr").notNull(),
    nameHanja: text("name_hanja"),
    nameEn: text("name_en"),
    birthDate: date("birth_date"),
    address: text("address"),
    email: text("email"),
    phone: text("phone"),
    photoFileId: uuid("photo_file_id").references(() => files.id, { onDelete: "set null" }),
    photoStoragePath: text("photo_storage_path"),

    // PII (pgcrypto) — app.encrypt_pii(text) → bytea.
    residentNumberEnc: bytea("resident_number_enc"),
    bankAccountEnc: bytea("bank_account_enc"),
    businessNumberEnc: bytea("business_number_enc"),
    withholdingTaxRateEnc: bytea("withholding_tax_rate_enc"),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [
    index("idx_instructors_user_id").on(t.userId),
    index("idx_instructors_email").on(t.email),
    index("idx_instructors_deleted").on(t.deletedAt),
  ],
);

export type Instructor = typeof instructors.$inferSelect;
export type NewInstructor = typeof instructors.$inferInsert;
