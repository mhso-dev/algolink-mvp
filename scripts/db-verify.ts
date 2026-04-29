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
import { readdirSync } from "node:fs";
import path from "node:path";
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

  // ===== Section 4: Skill Taxonomy (SPEC-SKILL-ABSTRACT-001) =====
  // 3-tier (large/medium/small) → 9개 추상 카테고리 단일 레벨로 supersede.
  await check("AC-SKILL-ABS-01: skill_categories 정확히 9 row", async () => {
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM skill_categories`;
    assert(count === 9, `skill_categories ${count} ≠ 9`);
  });

  await check("AC-SKILL-ABS-02: 9개 카테고리 UUID/이름/sort_order 정합", async () => {
    const rows = await sql<{ id: string; name: string; sort_order: number }[]>`
      SELECT id, name, sort_order FROM skill_categories ORDER BY sort_order
    `;
    const expected = [
      { id: "30000000-0000-0000-0000-000000000001", name: "데이터 분석", sort_order: 1 },
      { id: "30000000-0000-0000-0000-000000000002", name: "데이터 사이언스", sort_order: 2 },
      { id: "30000000-0000-0000-0000-000000000003", name: "AI·ML", sort_order: 3 },
      { id: "30000000-0000-0000-0000-000000000004", name: "백엔드", sort_order: 4 },
      { id: "30000000-0000-0000-0000-000000000005", name: "프론트엔드", sort_order: 5 },
      { id: "30000000-0000-0000-0000-000000000006", name: "풀스택", sort_order: 6 },
      { id: "30000000-0000-0000-0000-000000000007", name: "모바일", sort_order: 7 },
      { id: "30000000-0000-0000-0000-000000000008", name: "인프라·DevOps", sort_order: 8 },
      { id: "30000000-0000-0000-0000-000000000009", name: "클라우드", sort_order: 9 },
    ];
    assert(rows.length === expected.length, `row count ${rows.length} ≠ ${expected.length}`);
    for (let i = 0; i < expected.length; i++) {
      assert(rows[i]!.id === expected[i]!.id, `idx ${i} id ${rows[i]!.id} ≠ ${expected[i]!.id}`);
      assert(rows[i]!.name === expected[i]!.name, `idx ${i} name ${rows[i]!.name} ≠ ${expected[i]!.name}`);
      assert(rows[i]!.sort_order === expected[i]!.sort_order, `idx ${i} sort_order ${rows[i]!.sort_order} ≠ ${expected[i]!.sort_order}`);
    }
  });

  await check("AC-SKILL-ABS-03: skill_categories에 tier/parent_id 컬럼 부재", async () => {
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'skill_categories'
    `;
    const names = rows.map((r) => r.column_name);
    assert(!names.includes("tier"), `tier 컬럼이 여전히 존재: ${names.join(", ")}`);
    assert(!names.includes("parent_id"), `parent_id 컬럼이 여전히 존재: ${names.join(", ")}`);
  });

  await check("AC-SKILL-ABS-04: instructor_skills에 proficiency 컬럼 부재", async () => {
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'instructor_skills'
    `;
    const names = rows.map((r) => r.column_name);
    assert(!names.includes("proficiency"), `proficiency 컬럼이 여전히 존재: ${names.join(", ")}`);
    // 핵심 컬럼 존재 검증
    assert(names.includes("instructor_id"), "instructor_id 컬럼 누락");
    assert(names.includes("skill_id"), "skill_id 컬럼 누락");
    assert(names.includes("created_at"), "created_at 컬럼 누락");
  });

  await check("AC-SKILL-ABS-05: pg_type에 proficiency/skill_tier enum 부재", async () => {
    const rows = await sql<{ typname: string }[]>`
      SELECT typname FROM pg_type WHERE typname IN ('proficiency', 'skill_tier')
    `;
    assert(rows.length === 0, `잔존 enum 타입: ${rows.map((r) => r.typname).join(", ")}`);
  });

  await check("AC-SKILL-ABS-06: leaf-only enforcement 트리거 부재", async () => {
    const rows = await sql<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger
      WHERE tgname IN (
        'trg_instructor_skills_leaf_check',
        'trg_project_required_skills_leaf_check'
      )
    `;
    assert(rows.length === 0, `잔존 트리거: ${rows.map((r) => r.tgname).join(", ")}`);
  });

  // ===== Section 5: Project Workflow =====
  await check("AC-DB001-PROJ-01: project_status enum 정확히 14개 (SPEC-PAYOUT-002 evolved)", async () => {
    const rows = await sql<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'project_status'
      ORDER BY e.enumsortorder
    `;
    // SPEC-DB-001 13개 + SPEC-PAYOUT-002 REQ-EXCEPT-007 'instructor_withdrawn' 추가 = 14
    assert(rows.length === 14, `enum 수 ${rows.length} ≠ 14`);
    const expected = [
      "proposal", "contract_confirmed", "lecture_requested", "instructor_sourcing",
      "assignment_review", "assignment_confirmed", "education_confirmed", "recruiting",
      "progress_confirmed", "in_progress", "education_done", "settlement_in_progress",
      "task_done",
      "instructor_withdrawn",
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
    // postgres-js 는 bigint 컬럼을 string 으로 반환하므로 Number 캐스팅 후 비교.
    const fee = Number(r.instructor_fee_krw);
    const actual = Number(r.withholding_tax_amount_krw);
    const expected = Math.floor((fee * Number(r.withholding_tax_rate)) / 100);
    assert(
      actual === expected,
      `withholding_tax_amount_krw ${actual} ≠ ${expected}`,
    );
  });

  // ===== Section 8: Notifications enum =====
  await check("AC-DB001-NOTIF-01: notification_type enum 검증 (SPEC-DB-001 5종 + SPEC-PROJECT-001 assignment_request + SPEC-RECEIPT-001 receipt_issued + SPEC-CONFIRM-001 5종)", async () => {
    const rows = await sql<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'notification_type'
      ORDER BY enumlabel
    `;
    const names = rows.map((r) => r.enumlabel).sort();
    // SPEC-PROJECT-001 마이그레이션이 assignment_request를 추가.
    // SPEC-RECEIPT-001 §M1 마이그레이션이 receipt_issued를 추가.
    // SPEC-CONFIRM-001 §M1 마이그레이션이 5종(assignment_accepted/declined, inquiry_accepted/declined/conditional)을 추가.
    const expected = [
      "assignment_accepted", "assignment_declined", "assignment_overdue",
      "assignment_request", "dday_unprocessed", "inquiry_accepted",
      "inquiry_conditional", "inquiry_declined", "low_satisfaction_assignment",
      "receipt_issued", "schedule_conflict", "settlement_requested",
    ];
    assert(JSON.stringify(names) === JSON.stringify(expected),
      `notification_type ${JSON.stringify(names)} ≠ ${JSON.stringify(expected)}`);
  });

  // ===== SPEC-CONFIRM-001 §M1 verify =====
  await check("AC-CONFIRM-001-RESPONSES: instructor_responses 테이블 + CHECK XOR + partial UNIQUE 인덱스 정합", async () => {
    const cols = await sql<{ column_name: string; data_type: string; is_nullable: string }[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'instructor_responses'
      ORDER BY ordinal_position
    `;
    assert(cols.length === 10, `instructor_responses columns ${cols.length} ≠ 10`);
    const colNames = cols.map((c) => c.column_name).sort();
    const expectedCols = [
      "conditional_note", "created_at", "id", "instructor_id", "project_id",
      "proposal_inquiry_id", "responded_at", "source_kind", "status", "updated_at",
    ];
    assert(JSON.stringify(colNames) === JSON.stringify(expectedCols),
      `cols ${JSON.stringify(colNames)} ≠ ${JSON.stringify(expectedCols)}`);

    // CHECK XOR 제약 존재
    const checks = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'instructor_responses'::regclass AND contype = 'c'
    `;
    const checkNames = checks.map((c) => c.conname);
    assert(checkNames.includes("instructor_responses_source_xor"),
      `CHECK XOR 제약 부재: ${JSON.stringify(checkNames)}`);

    // partial UNIQUE 인덱스 2개
    const indexes = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'instructor_responses'
    `;
    const idxNames = indexes.map((i) => i.indexname);
    assert(idxNames.includes("uniq_instructor_responses_assignment"),
      `partial UNIQUE assignment 부재`);
    assert(idxNames.includes("uniq_instructor_responses_inquiry"),
      `partial UNIQUE inquiry 부재`);
    assert(idxNames.includes("idx_instructor_responses_by_instructor"),
      `instructor index 부재`);
  });

  await check("AC-CONFIRM-001-NOTIF-IDEMPOTENCY: notifications 테이블 source_kind/source_id + partial UNIQUE 인덱스", async () => {
    const cols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notifications'
      ORDER BY column_name
    `;
    const colNames = cols.map((c) => c.column_name);
    assert(colNames.includes("source_kind"), "notifications.source_kind 부재");
    assert(colNames.includes("source_id"), "notifications.source_id 부재");

    const indexes = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'notifications'
    `;
    const idxNames = indexes.map((i) => i.indexname);
    assert(idxNames.includes("idx_notifications_idempotency"),
      `idx_notifications_idempotency 부재: ${JSON.stringify(idxNames)}`);
  });

  // ===== SPEC-RECEIPT-001 §M1 verify =====
  await check(
    "AC-RECEIPT-001-FLOW: settlement_flow에 client_direct 추가",
    async () => {
      const rows = await sql<{ enumlabel: string }[]>`
        SELECT enumlabel FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'settlement_flow'
        ORDER BY enumlabel
      `;
      const names = rows.map((r) => r.enumlabel).sort();
      const expected = ["client_direct", "corporate", "government"];
      assert(
        JSON.stringify(names) === JSON.stringify(expected),
        `settlement_flow ${JSON.stringify(names)} ≠ ${JSON.stringify(expected)}`,
      );
    },
  );

  await check(
    "AC-RECEIPT-001-COLUMNS: settlements 6개 신규 컬럼 존재",
    async () => {
      const rows = await sql<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'settlements'
          AND column_name IN ('instructor_remittance_amount_krw',
                              'instructor_remittance_received_at',
                              'client_payout_amount_krw',
                              'receipt_file_id',
                              'receipt_issued_at',
                              'receipt_number')
      `;
      assert(rows.length === 6, `settlements 신규 6 컬럼 중 ${rows.length}개만 존재`);
    },
  );

  await check(
    "AC-RECEIPT-001-COUNTER: app.next_receipt_number() 함수 정상 발급",
    async () => {
      const result = await sql<{ next_receipt_number: string }[]>`
        SELECT app.next_receipt_number() AS next_receipt_number
      `;
      const value = result[0]?.next_receipt_number ?? "";
      assert(
        /^RCP-\d{4}-\d{4}$/.test(value),
        `app.next_receipt_number 결과 "${value}"가 RCP-YYYY-NNNN 형식 위반`,
      );
    },
  );

  await check(
    "AC-RECEIPT-001-ORG: organization_info 테이블 + 1행 존재",
    async () => {
      const rows = await sql<{ id: number; name: string }[]>`
        SELECT id, name FROM organization_info WHERE id = 1
      `;
      assert(rows.length === 1, `organization_info 1행 누락`);
      assert(rows[0]!.id === 1, `organization_info.id = 1 강제 위반`);
    },
  );

  await check(
    "AC-RECEIPT-001-BUCKET: payout-receipts + payout-evidence Storage 버킷 생성",
    async () => {
      const rows = await sql<{ id: string }[]>`
        SELECT id FROM storage.buckets
        WHERE id IN ('payout-receipts', 'payout-evidence')
      `;
      assert(
        rows.length === 2,
        `Storage 버킷 누락 (현재: ${rows.map((r) => r.id).join(",")})`,
      );
    },
  );

  await check(
    "AC-RECEIPT-001-HELPER: app.current_user_role() 함수 존재",
    async () => {
      const rows = await sql<{ proname: string }[]>`
        SELECT proname FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'app' AND proname = 'current_user_role'
      `;
      assert(rows.length === 1, `app.current_user_role() 함수 누락`);
    },
  );

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

  // ===== SPEC-DB-002: 마이그레이션 적용 누락 감지 =====
  await check("AC-DB002-MIG-PENDING: 모든 마이그레이션 적용됨", async () => {
    // REQ-DB002-002: schema_migrations 테이블이 없으면 skip (cloud / non-supabase 환경).
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS exists
    `;
    if (!exists) {
      // Skip 신호 — supabase_migrations 추적 테이블 부재.
      return;
    }

    // 파일 timestamp 수집 (yyyymmddhhmmss prefix 만).
    const migrationsDir = path.resolve("supabase/migrations");
    const fileTimestamps = readdirSync(migrationsDir)
      .filter((f) => /^\d{14}_.*\.sql$/.test(f))
      .map((f) => f.slice(0, 14));

    const appliedRows = await sql<{ version: string }[]>`
      SELECT version FROM supabase_migrations.schema_migrations
    `;
    const applied = new Set(appliedRows.map((r) => String(r.version)));

    const pending = fileTimestamps.filter((t) => !applied.has(t));
    if (pending.length > 0) {
      throw new Error(
        `${pending.length}건 누락 — 적용 필요: ${pending.join(", ")} (npx supabase db reset 또는 docker exec psql 로 적용)`,
      );
    }
  });

  // ===== Section 12-bis: SPEC-SEED-002 보강 시드 =====
  await check("AC-SEED002-PENDING-COUNT: pending settlements ≥ 3", async () => {
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM settlements WHERE status = 'pending'
    `;
    assert(count >= 3, `pending settlements ${count} < 3 — 20260428000020_e2e_seed_phase2.sql 미적용?`);
  });

  await check("AC-SEED002-OPERATOR2: operator2 시드 존재", async () => {
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM users
      WHERE email = 'operator2@algolink.local' AND role = 'operator'
    `;
    assert(count === 1, `operator2 행 ${count} ≠ 1 — 20260428000020_e2e_seed_phase2.sql 미적용?`);
  });

  // ===== Section 12: Seed (SPEC-SKILL-ABSTRACT-001 갱신) =====
  await check("AC-DB001-SEED-01: 필수 데이터 존재", async () => {
    const [r] = await sql<{
      admin_count: number; client_count: number; instructor_count: number;
      total_skill: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM users WHERE role = 'admin') AS admin_count,
        (SELECT count(*)::int FROM clients) AS client_count,
        (SELECT count(*)::int FROM instructors) AS instructor_count,
        (SELECT count(*)::int FROM skill_categories) AS total_skill
    `;
    assert(r.admin_count >= 1, `admin ${r.admin_count} < 1`);
    assert(r.client_count >= 2, `client ${r.client_count} < 2`);
    assert(r.instructor_count >= 3, `instructor ${r.instructor_count} < 3`);
    // SPEC-SKILL-ABSTRACT-001: 9개 추상 카테고리(단일 레벨)
    assert(r.total_skill === 9, `total_skill ${r.total_skill} ≠ 9`);
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
    // set_config(..., true)는 트랜잭션 로컬이므로 동일 트랜잭션 내에서 set + select 를 묶는다.
    // pgcrypto 는 extensions 스키마에 위치하므로 schema-qualified 호출 사용.
    const [r] = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.pii_encryption_key', 'dev-only-32byte-secret-XXXXXXXXXXXX', true)`;
      return tx<{ original: string; decrypted: string | null }[]>`
        SELECT
          '900101-1234567' AS original,
          extensions.pgp_sym_decrypt(
            app.encrypt_pii('900101-1234567'),
            current_setting('app.pii_encryption_key')
          ) AS decrypted
      `;
    });
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
