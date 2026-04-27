/**
 * 첫 admin 사용자 부트스트랩 CLI (멱등).
 * SPEC-AUTH-001 §1.4 / §5.7 / plan.md M11 / acceptance.md EC-11.
 *
 * 사용법:
 *   pnpm auth:bootstrap-admin --email <email> --password <password> [--name <name>] [--force-promote]
 *   pnpm auth:bootstrap-admin --help
 *
 * 동작:
 *   1. SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL 검증
 *   2. public.users 에 admin 이 이미 존재하면 skip + exit 0
 *   3. 동일 이메일이 instructor/operator 인 경우 --force-promote 시 role=admin 으로 UPDATE
 *   4. 없으면 auth.admin.createUser 후 public.users UPSERT
 *
 * 종료 코드:
 *   0 = 성공 또는 멱등 skip
 *   1 = 환경/인자/실행 오류
 */

import { parseArgs } from "node:util";
import { config as loadEnv } from "dotenv";

// .env.local 우선 로드, 그다음 .env fallback.
// supabase 클라이언트보다 먼저 import 되는 것이 중요하지만,
// admin.ts 는 함수 호출 시점에 process.env 를 읽으므로 순서 무관.
loadEnv({ path: ".env.local" });
loadEnv();

import { createClient } from "@supabase/supabase-js";
import { emailSchema } from "../../src/lib/validation/auth";
import { isValidRole } from "../../src/auth/roles";
import type { Database } from "../../src/db/supabase-types";

// 주의: src/auth/admin.ts 는 "server-only" 임포트로 인해 Node CLI 컨텍스트에서 import 시
// 즉시 throw 한다. 따라서 동일한 service-role 클라이언트 생성 로직을 본 스크립트에 인라인한다.
// 검증 규칙은 admin.ts 와 동일하게 유지한다 (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
function createServiceSupabaseForCli() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const USAGE = `
첫 admin 사용자 부트스트랩 CLI (멱등)

사용법:
  pnpm auth:bootstrap-admin --email <email> --password <password> [--name <name>] [--force-promote]
  pnpm auth:bootstrap-admin --help

옵션:
  --email           (필수) admin 이메일 주소
  --password        (필수) 초기 비밀번호 (12자 이상 권장)
  --name            (선택) public.users.name_kr 에 저장할 표시 이름. 미지정 시 이메일 local-part 사용
  --force-promote   (선택) 동일 이메일이 instructor/operator 로 존재하면 admin 으로 승격
  --help            이 도움말 출력

필수 환경변수 (.env.local):
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

종료 코드:
  0 = 성공 또는 멱등 skip
  1 = 오류
`.trim();

// 이메일 마스킹: a***@domain.com.
function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, 1);
  return `${head}***@${domain}`;
}

async function main(): Promise<number> {
  // 1) argv 파싱.
  let parsed: ReturnType<typeof parseArgs<{ options: Record<string, never> }>>;
  try {
    parsed = parseArgs({
      options: {
        email: { type: "string" },
        password: { type: "string" },
        name: { type: "string" },
        "force-promote": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }) as never;
  } catch (err) {
    console.error(`오류: 인자 파싱 실패 — ${(err as Error).message}`);
    console.error(USAGE);
    return 1;
  }

  const values = (parsed as { values: Record<string, unknown> }).values;

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const email = typeof values.email === "string" ? values.email.trim() : "";
  const password = typeof values.password === "string" ? values.password : "";
  const name = typeof values.name === "string" ? values.name.trim() : "";
  const forcePromote = Boolean(values["force-promote"]);

  // 2) 필수 인자 검증.
  if (!email) {
    console.error("오류: --email 인자는 필수입니다.");
    console.error(USAGE);
    return 1;
  }
  if (!password) {
    console.error("오류: --password 인자는 필수입니다.");
    console.error(USAGE);
    return 1;
  }

  const emailParse = emailSchema.safeParse(email);
  if (!emailParse.success) {
    console.error(
      `오류: 이메일 형식이 올바르지 않습니다 — ${emailParse.error.issues[0]?.message ?? "invalid email"}`,
    );
    return 1;
  }

  // 3) 환경변수 검증 (admin.ts 도 검증하지만, 더 친절한 메시지를 위해 선검증).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "오류: SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되어 있지 않습니다.",
    );
    console.error(
      "       .env.local 에 service_role 키를 추가하거나 셸에서 export 하세요.",
    );
    return 1;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error(
      "오류: NEXT_PUBLIC_SUPABASE_URL 환경변수가 설정되어 있지 않습니다.",
    );
    return 1;
  }

  // 4) Supabase 서비스 클라이언트.
  const supabase = createServiceSupabaseForCli();

  // 5) 멱등성 체크: 기존 admin 조회.
  const { data: existingAdmins, error: adminQueryError } = await supabase
    .from("users")
    .select("id, email, role")
    .eq("role", "admin");

  if (adminQueryError) {
    console.error(
      `오류: 기존 admin 조회 실패 — ${adminQueryError.message}`,
    );
    return 1;
  }

  // 6) 동일 이메일 사용자 조회.
  const { data: targetRows, error: targetQueryError } = await supabase
    .from("users")
    .select("id, email, role, name_kr")
    .eq("email", email)
    .limit(1);

  if (targetQueryError) {
    console.error(
      `오류: 대상 이메일 사용자 조회 실패 — ${targetQueryError.message}`,
    );
    return 1;
  }

  const targetRow = targetRows?.[0];

  // 6a) 동일 이메일이 이미 admin 이면 skip.
  if (targetRow && targetRow.role === "admin") {
    console.log(
      `Admin with this email already exists. Skipping. (email=${redactEmail(email)})`,
    );
    return 0;
  }

  // 6b) 동일 이메일이 다른 role 이면 force-promote 분기.
  if (targetRow && isValidRole(targetRow.role) && targetRow.role !== "admin") {
    if (!forcePromote) {
      console.error(
        `User exists with role=${targetRow.role}. Use --force-promote to upgrade to admin.`,
      );
      return 1;
    }

    // role 승격 (auth.users 비밀번호는 변경하지 않음).
    const { error: updateError } = await supabase
      .from("users")
      .update({ role: "admin" })
      .eq("id", targetRow.id);

    if (updateError) {
      console.error(
        `오류: role 승격 실패 — ${updateError.message}`,
      );
      return 1;
    }

    console.log(
      `Promoted to admin: ${redactEmail(email)} (id=${targetRow.id}, previous role=${targetRow.role})`,
    );
    return 0;
  }

  // 6c) 동일 이메일 사용자가 없는 상태에서, 이미 admin 이 1명 이상 있으면 skip.
  //     (첫 admin 부트스트랩만 자동 생성. 추가 admin 은 초대 플로우로 생성.)
  if (existingAdmins && existingAdmins.length > 0) {
    const redacted = existingAdmins
      .map((row) => redactEmail(row.email))
      .join(", ");
    console.log(
      `Admin already exists. Skipping. (existing admins: ${redacted})`,
    );
    return 0;
  }

  // 7) 신규 admin 생성: auth.users → public.users.
  const displayName = name || (email.split("@")[0] ?? "admin");

  const createRes = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: name ? { name } : {},
  });

  if (createRes.error || !createRes.data.user) {
    console.error(
      `오류: auth 사용자 생성 실패 — ${createRes.error?.message ?? "user not returned"}`,
    );
    return 1;
  }

  const newUserId = createRes.data.user.id;

  // public.users UPSERT (auth.users 와 1:1, id 가 PK).
  const { error: upsertError } = await supabase
    .from("users")
    .upsert(
      {
        id: newUserId,
        email,
        role: "admin",
        name_kr: displayName,
      },
      { onConflict: "id" },
    );

  if (upsertError) {
    console.error(
      `오류: public.users upsert 실패 — ${upsertError.message}`,
    );
    console.error(
      `       auth.users 에는 사용자 ${newUserId} 가 생성된 상태입니다. 수동 정리가 필요할 수 있습니다.`,
    );
    return 1;
  }

  console.log(`Admin created: ${redactEmail(email)} (id=${newUserId})`);
  return 0;
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error(`오류: ${(err as Error).message ?? String(err)}`);
    process.exit(1);
  });
