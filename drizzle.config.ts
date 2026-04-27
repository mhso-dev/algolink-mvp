// @MX:NOTE: SPEC-DB-001 §4.1 — Drizzle Kit 출력은 임시 폴더(./drizzle/)로,
// 검토 후 supabase/migrations/{timestamp}_initial_schema.sql로 수동 이동.
// @MX:REASON: RLS/EXCLUSION/트리거/Seed는 Drizzle Kit 미지원 → 수동 SQL과 분리 관리.
import "dotenv/config";
import type { Config } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: true,
} satisfies Config;
