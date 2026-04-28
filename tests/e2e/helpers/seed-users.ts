/**
 * SPEC-E2E-001 — 시드 사용자 자격 증명 export.
 *
 * Playwright spec 들이 직접 PERSONAS 를 import 해도 되지만, SPEC-E2E-001 §helpers
 * 요구에 따라 SEED_USERS 라는 단순 dict 형태도 함께 제공한다.
 *
 * 환경 변수 override 우선순위:
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *   SEED_OPERATOR_EMAIL / SEED_OPERATOR_PASSWORD
 *   SEED_INSTRUCTOR_EMAIL / SEED_INSTRUCTOR_PASSWORD
 *
 * Defaults: scripts/seed-users.ts + scripts/auth/bootstrap-admin.ts 와 일치.
 */
import { PERSONAS } from "./personas";

export interface SeedUser {
  email: string;
  password: string;
}

function pick(envEmail: string | undefined, envPwd: string | undefined, fallback: SeedUser): SeedUser {
  return {
    email: envEmail?.trim() || fallback.email,
    password: envPwd?.trim() || fallback.password,
  };
}

export const SEED_USERS = {
  admin: pick(
    process.env.SEED_ADMIN_EMAIL,
    process.env.SEED_ADMIN_PASSWORD,
    { email: PERSONAS.admin.email, password: PERSONAS.admin.password },
  ),
  operator: pick(
    process.env.SEED_OPERATOR_EMAIL,
    process.env.SEED_OPERATOR_PASSWORD,
    { email: PERSONAS.operator.email, password: PERSONAS.operator.password },
  ),
  instructor: pick(
    process.env.SEED_INSTRUCTOR_EMAIL,
    process.env.SEED_INSTRUCTOR_PASSWORD,
    { email: PERSONAS.instructor.email, password: PERSONAS.instructor.password },
  ),
  // SPEC-SEED-002 — 보조 operator (Phase 2 ADMIN 비활성화 시나리오용).
  // 시드 SQL `20260428000020_e2e_seed_phase2.sql` 와 동일 자격증명.
  operator2: pick(
    process.env.SEED_OPERATOR2_EMAIL,
    process.env.SEED_OPERATOR2_PASSWORD,
    { email: "operator2@algolink.local", password: "DevOperator2!2026" },
  ),
} as const;
