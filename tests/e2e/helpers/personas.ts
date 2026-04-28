/**
 * E2E 테스트용 페르소나 정의.
 *
 * 시드 사용자(scripts/seed-users.ts + Supabase auth)와 1:1 매칭.
 * - admin@algolink.local       → role=admin       → home=/dashboard
 * - operator@algolink.local    → role=operator    → home=/dashboard
 * - instructor1@algolink.local → role=instructor  → home=/me
 *   (instructor row 30000000-0000-0000-0000-000000000001 ↔ user 00000000-0000-0000-0000-00000000cccc)
 */
export type PersonaRole = "admin" | "operator" | "instructor";

export interface Persona {
  role: PersonaRole;
  email: string;
  password: string;
  homePath: string;
  storageStatePath: string;
}

export const PERSONAS: Record<PersonaRole, Persona> = {
  admin: {
    role: "admin",
    email: "admin@algolink.local",
    password: "DevAdmin!2026",
    homePath: "/dashboard",
    storageStatePath: "tests/e2e/.auth/admin.json",
  },
  operator: {
    role: "operator",
    email: "operator@algolink.local",
    password: "DevOperator!2026",
    homePath: "/dashboard",
    storageStatePath: "tests/e2e/.auth/operator.json",
  },
  instructor: {
    role: "instructor",
    email: "instructor1@algolink.local",
    password: "DevInstructor!2026",
    homePath: "/me",
    storageStatePath: "tests/e2e/.auth/instructor.json",
  },
};
