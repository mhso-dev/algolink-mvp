/**
 * Seed Supabase Auth 사용자 + public.users 프로필.
 *
 * 실행:
 *   pnpm db:seed-users
 *
 * 동작:
 *   1. Service role(secret key)로 Auth Admin client 생성
 *   2. admin/operator/instructor 3명을 auth.users에 멱등 생성 (이메일 기준)
 *   3. 받은 UUID로 public.users INSERT (ON CONFLICT DO NOTHING)
 *   4. 첫 번째 instructor 프로필(30000000-...-001)에 instructor user_id 연결
 *
 * 환경 변수 (.env.local):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SECRET_KEY (service role 키, 절대 클라이언트 노출 금지)
 *
 * 종료 코드: 0 성공, 1 실패
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv(); // .env fallback

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY 누락. .env.local 확인.");
  process.exit(1);
}

type SeedUser = {
  email: string;
  password: string;
  role: "admin" | "operator" | "instructor";
  name_kr: string;
};

const SEED_USERS: SeedUser[] = [
  { email: "admin@algolink.local",      password: "DevAdmin!2026",      role: "admin",      name_kr: "관리자" },
  { email: "operator@algolink.local",   password: "DevOperator!2026",   role: "operator",   name_kr: "운영자" },
  { email: "instructor1@algolink.local", password: "DevInstructor!2026", role: "instructor", name_kr: "강사 사용자" },
];

const FIRST_INSTRUCTOR_ID = "30000000-0000-0000-0000-000000000001";

const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureAuthUser(seed: SeedUser): Promise<string> {
  // 1) listUsers로 이메일 일치 검색 (페이지네이션 — 첫 페이지만; dev 시드 규모에서 충분)
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw new Error(`listUsers 실패: ${listErr.message}`);

  const existing = list.users.find((u) => u.email === seed.email);
  if (existing) {
    console.log(`  ↻ 이미 존재: ${seed.email} (${existing.id})`);
    return existing.id;
  }

  // 2) 없으면 생성. email_confirm: true 로 verify 단계 건너뜀 (dev 환경)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: seed.email,
    password: seed.password,
    email_confirm: true,
    app_metadata: { role: seed.role },
    user_metadata: { name_kr: seed.name_kr },
  });
  if (createErr || !created.user) {
    throw new Error(`createUser 실패 (${seed.email}): ${createErr?.message}`);
  }
  console.log(`  + 생성: ${seed.email} (${created.user.id})`);
  return created.user.id;
}

async function upsertProfile(authUserId: string, seed: SeedUser): Promise<void> {
  const { error } = await admin
    .from("users")
    .upsert(
      { id: authUserId, role: seed.role, name_kr: seed.name_kr, email: seed.email },
      { onConflict: "id" },
    );
  if (error) throw new Error(`users upsert 실패 (${seed.email}): ${error.message}`);
}

async function linkInstructorProfile(authUserId: string): Promise<void> {
  const { error } = await admin
    .from("instructors")
    .update({ user_id: authUserId })
    .eq("id", FIRST_INSTRUCTOR_ID)
    .is("user_id", null);
  if (error) throw new Error(`instructor 연결 실패: ${error.message}`);
}

async function main() {
  console.log("→ Auth 사용자 시드 시작");
  for (const seed of SEED_USERS) {
    const authId = await ensureAuthUser(seed);
    await upsertProfile(authId, seed);
    if (seed.role === "instructor") {
      await linkInstructorProfile(authId);
      console.log(`  → instructor 프로필(${FIRST_INSTRUCTOR_ID})에 user_id 연결`);
    }
  }
  console.log("✓ 완료");
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
