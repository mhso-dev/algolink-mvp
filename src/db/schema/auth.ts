// @MX:ANCHOR: SPEC-DB-001 REQ-DB001-AUTH — Supabase auth.users를 신원 소스로 사용.
// @MX:REASON: users.id는 auth.uid()와 동일한 UUID이며 모든 도메인 테이블이 FK로 참조 (fan_in 매우 높음).
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { userRole } from "../enums";

/**
 * 프로젝트 레벨 사용자 프로필.
 * id는 auth.users.id와 동일한 UUID. Supabase Auth 가입 후 트리거 또는
 * 애플리케이션 레이어가 본 테이블에 row를 생성한다.
 */
export const users = pgTable("users", {
  // auth.users.id와 동일. FK 제약은 마이그레이션 SQL에서 ALTER TABLE로 추가
  // (Drizzle Kit이 auth 스키마를 인식하지 못하므로).
  id: uuid("id").primaryKey(),
  role: userRole("role").notNull(),
  nameKr: text("name_kr").notNull(),
  email: text("email").notNull().unique(),
  // SPEC-ADMIN-001 F-301: admin이 비활성화 가능. false면 미들웨어가 다음 로그인부터 차단.
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
