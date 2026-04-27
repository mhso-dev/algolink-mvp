/**
 * SPEC-DB-001 acceptance.md — Given-When-Then 시나리오 자동 검증.
 *
 * 실행:
 *   pnpm db:verify
 *
 * 사전조건:
 *   - DATABASE_URL이 .env.local 또는 환경변수에 설정되어 있어야 함.
 *   - Supabase 로컬이 실행 중이어야 함 (`pnpm supabase:start && pnpm supabase:reset`).
 *
 * 동작 원리:
 *   - postgres-js로 DB에 연결.
 *   - 각 시나리오를 SQL로 실행하고 기대값과 비교.
 *   - 실패 시 종료 코드 1 + 상세 출력. 모두 통과 시 0.
 *
 * 종료 코드 의미:
 *   0: 모든 시나리오 통과.
 *   1: 1개 이상 실패 (CI 차단).
 *   2: 환경 설정 오류 (DB 연결 실패 등).
 */
import "dotenv/config";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("✗ DATABASE_URL not set. Copy .env.example to .env.local first.");
  process.exit(2);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

type Result = { name: string; status: "pass" | "fail" | "skip"; detail?: string };
const results: Result[] = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, status: "pass" });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ name, status: "fail", detail });
  }
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  // ===== Section 1: Migration & Environment =====
  await check("AC-DB001-MIG-01: pgcrypto + btree_gist 확장 활성화", async () => {
    const rows = await sql<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','btree_gist')`;
    const names = rows.map((r) => r.extname);
    assert(names.includes("pgcrypto"), "pgcrypto 누락");
    assert(names.includes("btree_gist"), "btree_gist 누락");
  });

  await check("AC-DB001-MIG-01: public 테이블 ≥ 25개", async () => {
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'`;
    assert(count >= 25, `테이블 수 ${count} < 25`);
  });

  // ===== Section 4: Skill Taxonomy =====
  await check("AC-DB001-SKILL-01: 대단위 카테고리 정확히 12개", async () => {
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM skill_categories WHERE tier = 'large'`;
    assert(count === 12, `large tier ${count} ≠ 12`);
  });

  await check("AC-DB001-SKILL-02: leaf node가 아닌 카테고리에 강사 매핑 거부", async () => {
    // 대단위 '프로그래밍'(자식 있음)에 매핑 시도 → 트리거 거부
    const inst = await sql<{ id: string }[]>`SELECT id FROM instructors LIMIT 1`;
    if (inst.length === 0) throw new Error("샘플 강사가 없음 (seed 미실행?)");
    const instructorId = inst[0].id;
    const largeProgramming = "10000000-0000-0000-0000-000000000001";
    let rejected = false;
    try {
      await sql`INSERT INTO instructor_skills (instructor_id, skill_id, proficiency)
                VALUES (${instructorId}, ${largeProgramming}, 'expert')`;
    } catch {
      rejected = true;
      // 정상: 트리거가 23514로 거부.
    }
    assert(rejected, "대단위 카테고리 매핑이 거부되지 않음");
  });

  await check("AC-DB001-SKILL-03: 3-tier 계층 무결성", async () => {
    const rows = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM skill_categories s
      JOIN skill_categories m ON s.parent_id = m.id
      JOIN skill_categories l ON m.parent_id = l.id
      WHERE s.tier = 'small' AND m.tier = 'medium' AND l.tier = 'large'
    `;
    assert(rows[0].count > 0, "3-tier 무결성 위반: small→medium→large 체인 없음");
  });

  // ===== Section 5: Project Workflow =====
  await check("AC-DB001-PROJ-01: project_status enum 정확히 13개", async () => {
    const rows = await sql<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'project_status'
      ORDER BY e.enumsortorder
    `;
    assert(rows.length === 13, `enum 수 ${rows.length} ≠ 13`);
    const expected = [
      "proposal", "contract_confirmed", "lecture_requested", "instructor_sourcing",
      "assignment_review", "assignment_confirmed", "education_confirmed", "recruiting",
      "progress_confirmed", "in_progress", "education_done", "settlement_in_progress",
      "task_done",
    ];
    for (let i = 0; i < expected.length; i++) {
      assert(rows[i].enumlabel === expected[i], `index ${i}: ${rows[i].enumlabel} ≠ ${expected[i]}`);
    }
  });

  await check("AC-DB001-PROJ-02: 마진 GENERATED 자동계산", async () => {
    const [row] = await sql<{ margin_krw: number; expected: number }[]>`
      SELECT margin_krw, (business_amount_krw - instructor_fee_krw) AS expected
      FROM projects
      LIMIT 1
    `;
    assert(row.margin_krw === row.expected, `margin ${row.margin_krw} ≠ ${row.expected}`);
  });

  // ===== Section 6: Schedule Conflict =====
  await check("AC-DB001-SCHED-01/02: EXCLUSION 충돌 거부 + 다른 강사 동시간 허용", async () => {
    const inst = await sql<{ id: string }[]>`SELECT id FROM instructors ORDER BY created_at LIMIT 2`;
    assert(inst.length >= 2, "강사 2명 이상 필요");
    const [a, b] = inst;
    const project = await sql<{ id: string }[]>`SELECT id FROM projects LIMIT 1`;
    const projectId = project[0]!.id;

    // 클린업
    await sql`DELETE FROM schedule_items WHERE notes = '__db-verify-test__'`;

    // 1. 강사 A 09:00-12:00 system_lecture INSERT
    await sql`INSERT INTO schedule_items (instructor_id, schedule_kind, project_id, starts_at, ends_at, notes)
              VALUES (${a.id}, 'system_lecture', ${projectId},
                      '2026-09-01T09:00:00+09:00', '2026-09-01T12:00:00+09:00', '__db-verify-test__')`;

    // 2. 강사 A 11:00-14:00 system_lecture INSERT → EXCLUSION 거부
    let conflictRejected = false;
    try {
      await sql`INSERT INTO schedule_items (instructor_id, schedule_kind, project_id, starts_at, ends_at, notes)
                VALUES (${a.id}, 'system_lecture', ${projectId},
                        '2026-09-01T11:00:00+09:00', '2026-09-01T14:00:00+09:00', '__db-verify-test__')`;
    } catch {
      conflictRejected = true;
    }
    assert(conflictRejected, "EXCLUSION이 충돌을 거부하지 않음");

    // 3. 강사 B 09:00-12:00 INSERT → 성공해야 함 (다른 강사)
    await sql`INSERT INTO schedule_items (instructor_id, schedule_kind, project_id, starts_at, ends_at, notes)
              VALUES (${b.id}, 'system_lecture', ${projectId},
                      '2026-09-01T09:00:00+09:00', '2026-09-01T12:00:00+09:00', '__db-verify-test__')`;

    // 4. 강사 A 09:00-12:00 personal INSERT → 성공해야 함 (WHERE 절 제외)
    await sql`INSERT INTO schedule_items (instructor_id, schedule_kind, starts_at, ends_at, notes)
              VALUES (${a.id}, 'personal',
                      '2026-09-01T09:00:00+09:00', '2026-09-01T12:00:00+09:00', '__db-verify-test__')`;

    // cleanup
    await sql`DELETE FROM schedule_items WHERE notes = '__db-verify-test__'`;
  });

  // ===== Section 7: Settlement CHECK =====
  await check("AC-DB001-SETTLE-02: corporate + 8.80% INSERT 거부", async () => {
    const project = await sql<{ id: string }[]>`SELECT id FROM projects LIMIT 1`;
    const inst = await sql<{ id: string }[]>`SELECT id FROM instructors LIMIT 1`;
    let rejected = false;
    try {
      await sql`INSERT INTO settlements (project_id, instructor_id, settlement_flow,
                                          business_amount_krw, instructor_fee_krw, withholding_tax_rate)
                VALUES (${project[0]!.id}, ${inst[0]!.id}, 'corporate', 1000000, 600000, 8.80)`;
    } catch {
      rejected = true;
    }
    assert(rejected, "corporate + 8.80% 가 CHECK로 거부되지 않음");
  });

  await check("AC-DB001-SETTLE-04: government + 5.00% INSERT 거부", async () => {
    const project = await sql<{ id: string }[]>`SELECT id FROM projects LIMIT 1`;
    const inst = await sql<{ id: string }[]>`SELECT id FROM instructors LIMIT 1`;
    let rejected = false;
    try {
      await sql`INSERT INTO settlements (project_id, instructor_id, settlement_flow,
                                          business_amount_krw, instructor_fee_krw, withholding_tax_rate)
                VALUES (${project[0]!.id}, ${inst[0]!.id}, 'government', 1000000, 600000, 5.00)`;
    } catch {
      rejected = true;
    }
    assert(rejected, "government + 5.00% 가 CHECK로 거부되지 않음");
  });

  await check("AC-DB001-SETTLE-01: 기존 government 정산의 원천세 자동계산 (GENERATED)", async () => {
    const rows = await sql<{ instructor_fee_krw: number; withholding_tax_amount_krw: number; withholding_tax_rate: string }[]>`
      SELECT instructor_fee_krw, withholding_tax_amount_krw, withholding_tax_rate
      FROM settlements
      WHERE settlement_flow = 'government'
      LIMIT 1
    `;
    if (rows.length === 0) return; // seed에 없으면 skip
    const r = rows[0];
    const expected = Math.floor((r.instructor_fee_krw * Number(r.withholding_tax_rate)) / 100);
    assert(
      r.withholding_tax_amount_krw === expected,
      `withholding_tax_amount_krw ${r.withholding_tax_amount_krw} ≠ ${expected}`,
    );
  });

  // ===== Section 8: Notifications enum =====
  await check("AC-DB001-NOTIF-01: notification_type enum 5개 검증", async () => {
    const rows = await sql<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'notification_type'
      ORDER BY enumlabel
    `;
    const names = rows.map((r) => r.enumlabel).sort();
    const expected = [
      "assignment_overdue", "dday_unprocessed", "low_satisfaction_assignment",
      "schedule_conflict", "settlement_requested",
    ];
    assert(JSON.stringify(names) === JSON.stringify(expected),
      `notification_type ${JSON.stringify(names)} ≠ ${JSON.stringify(expected)}`);
  });

  // ===== Section 11: Review =====
  await check("AC-DB001-REVIEW-01: score > 5 CHECK 거부", async () => {
    const inst = await sql<{ id: string }[]>`SELECT id FROM instructors LIMIT 1`;
    const project = await sql<{ id: string }[]>`SELECT id FROM projects LIMIT 1`;
    let rejected = false;
    try {
      await sql`INSERT INTO satisfaction_reviews (instructor_id, project_id, score, comment)
                VALUES (${inst[0]!.id}, ${project[0]!.id}, 6, '__test__')`;
    } catch {
      rejected = true;
    }
    assert(rejected, "score=6이 CHECK로 거부되지 않음");
  });

  // ===== Section 12: Seed =====
  await check("AC-DB001-SEED-01: 필수 데이터 존재", async () => {
    const [r] = await sql<{
      admin_count: number; client_count: number; instructor_count: number;
      large_skill: number; total_skill: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM users WHERE role = 'admin') AS admin_count,
        (SELECT count(*)::int FROM clients) AS client_count,
        (SELECT count(*)::int FROM instructors) AS instructor_count,
        (SELECT count(*)::int FROM skill_categories WHERE tier = 'large') AS large_skill,
        (SELECT count(*)::int FROM skill_categories) AS total_skill
    `;
    assert(r.admin_count >= 1, `admin ${r.admin_count} < 1`);
    assert(r.client_count >= 2, `client ${r.client_count} < 2`);
    assert(r.instructor_count >= 3, `instructor ${r.instructor_count} < 3`);
    assert(r.large_skill === 12, `large_skill ${r.large_skill} ≠ 12`);
    assert(r.total_skill >= 60, `total_skill ${r.total_skill} < 60`);
  });

  // ===== Section 3: PII =====
  await check("AC-DB001-PII-01: PII 컬럼이 bytea 타입", async () => {
    const [r] = await sql<{ data_type: string }[]>`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'instructors' AND column_name = 'resident_number_enc'
    `;
    assert(r.data_type === "bytea", `data_type ${r.data_type} ≠ bytea`);
  });

  await check("AC-DB001-PII-02: 암호화-복호화 라운드트립", async () => {
    // app.pii_encryption_key 설정.
    await sql`SELECT set_config('app.pii_encryption_key', 'dev-only-32byte-secret-XXXXXXXXXXXX', true)`;
    const [r] = await sql<{ original: string; decrypted: string | null }[]>`
      SELECT
        '900101-1234567' AS original,
        pgp_sym_decrypt(app.encrypt_pii('900101-1234567'),
                        current_setting('app.pii_encryption_key')) AS decrypted
    `;
    assert(r.decrypted === r.original, `복호화 결과 ${r.decrypted} ≠ ${r.original}`);
  });

  // ===== Section 2: RLS structural =====
  await check("AC-DB001-RLS-00: 모든 public 테이블 RLS 활성화", async () => {
    const rows = await sql<{ table_name: string; rowsecurity: boolean }[]>`
      SELECT c.relname AS table_name, c.relrowsecurity AS rowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `;
    const disabled = rows.filter((r) => !r.rowsecurity);
    assert(disabled.length === 0, `RLS 미활성화 테이블: ${disabled.map((d) => d.table_name).join(", ")}`);
  });

  await check("AC-DB001-RLS-00: 모든 public 테이블에 정책 ≥ 1", async () => {
    const rows = await sql<{ tablename: string; policy_count: number }[]>`
      SELECT t.tablename,
             COALESCE((SELECT count(*)::int FROM pg_policies p WHERE p.tablename = t.tablename), 0) AS policy_count
      FROM (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      ) t
    `;
    const noPolicy = rows.filter((r) => r.policy_count === 0);
    assert(noPolicy.length === 0, `정책 없는 테이블: ${noPolicy.map((r) => r.tablename).join(", ")}`);
  });

  // ===== 보고 =====
  console.log("");
  console.log("=== SPEC-DB-001 db-verify 결과 ===");
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "○";
    console.log(`${icon} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.status === "pass") passed++;
    else if (r.status === "fail") failed++;
  }
  console.log("");
  console.log(`총 ${results.length}건: 통과 ${passed} / 실패 ${failed}`);

  await sql.end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("✗ db-verify fatal:", e);
  await sql.end().catch(() => {});
  process.exit(2);
});
