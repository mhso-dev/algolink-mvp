// SPEC-PAYOUT-002 §M5 — generate.ts 단위 테스트.
// REQ-PAYOUT002-GENERATE-003/-006/-008, REQ-PAYOUT002-LINK-006 (race-condition).
// Scenario 4 (다중 프로젝트), 5 (이중 청구), 10 (race), 17 (flow defaulting) 자동화.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupAndCompute,
  generateSettlementsForPeriod,
  buildSettlementPreview,
} from "../generate";
import { SESSION_ERRORS } from "../../sessions/errors";
import type { LectureSession } from "../../sessions/types";

const PROJ_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJ_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INSTR_A = "11111111-aaaa-aaaa-aaaa-111111111111";
const INSTR_B = "22222222-bbbb-bbbb-bbbb-222222222222";

function makeSession(
  overrides: Partial<LectureSession> & {
    id: string;
    project_id: string;
  },
): LectureSession {
  return {
    instructor_id: INSTR_A,
    date: "2026-05-03",
    hours: 2.0,
    status: "completed",
    original_session_id: null,
    notes: null,
    created_at: "2026-04-29T00:00:00Z",
    updated_at: "2026-04-29T00:00:00Z",
    deleted_at: null,
    ...overrides,
  } as LectureSession;
}

// =============================================================================
// groupAndCompute (순수 함수)
// =============================================================================

test("groupAndCompute: 단일 프로젝트 — 산식 정합 (Scenario 1)", () => {
  const sessions: LectureSession[] = [
    makeSession({ id: "s-1", project_id: PROJ_A, hours: 2.0 }),
    makeSession({ id: "s-2", project_id: PROJ_A, hours: 2.0 }),
    makeSession({ id: "s-3", project_id: PROJ_A, hours: 2.0 }),
    makeSession({ id: "s-4", project_id: PROJ_A, hours: 2.0 }),
    makeSession({ id: "s-5", project_id: PROJ_A, hours: 2.0 }),
  ];
  const projects = new Map([
    [
      PROJ_A,
      {
        id: PROJ_A,
        instructor_id: INSTR_A,
        hourly_rate_krw: 100_000,
        instructor_share_pct: 70,
        settlement_flow_hint: "corporate",
      },
    ],
  ]);
  const rows = groupAndCompute(sessions, projects);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.total_hours, 10.0);
  assert.equal(row.business_amount_krw, 1_000_000);
  assert.equal(row.instructor_fee_per_hour, 70_000);
  assert.equal(row.instructor_fee_krw, 700_000);
  assert.equal(row.default_flow, "corporate");
  assert.equal(row.session_ids.length, 5);
});

test("groupAndCompute: 다중 프로젝트 (Scenario 4)", () => {
  // P1: 100k/70% × 6h = 600k / 강사비 6 × 70k = 420k
  // P2: 80k/60% × 8h = 640k / 강사비 8 × 48k = 384k
  const sessions: LectureSession[] = [
    makeSession({ id: "p1-1", project_id: PROJ_A, hours: 2.0 }),
    makeSession({ id: "p1-2", project_id: PROJ_A, hours: 2.0 }),
    makeSession({ id: "p1-3", project_id: PROJ_A, hours: 2.0 }),
    makeSession({ id: "p2-1", project_id: PROJ_B, instructor_id: INSTR_B, hours: 2.0 }),
    makeSession({ id: "p2-2", project_id: PROJ_B, instructor_id: INSTR_B, hours: 2.0 }),
    makeSession({ id: "p2-3", project_id: PROJ_B, instructor_id: INSTR_B, hours: 2.0 }),
    makeSession({ id: "p2-4", project_id: PROJ_B, instructor_id: INSTR_B, hours: 2.0 }),
  ];
  const projects = new Map([
    [
      PROJ_A,
      {
        id: PROJ_A,
        instructor_id: INSTR_A,
        hourly_rate_krw: 100_000,
        instructor_share_pct: 70,
        settlement_flow_hint: "corporate",
      },
    ],
    [
      PROJ_B,
      {
        id: PROJ_B,
        instructor_id: INSTR_B,
        hourly_rate_krw: 80_000,
        instructor_share_pct: 60,
        settlement_flow_hint: "corporate",
      },
    ],
  ]);
  const rows = groupAndCompute(sessions, projects);
  assert.equal(rows.length, 2);
  const p1 = rows.find((r) => r.project_id === PROJ_A);
  const p2 = rows.find((r) => r.project_id === PROJ_B);
  assert.ok(p1 && p2);
  assert.equal(p1!.business_amount_krw, 600_000);
  assert.equal(p1!.instructor_fee_krw, 420_000);
  assert.equal(p2!.business_amount_krw, 640_000);
  assert.equal(p2!.instructor_fee_krw, 384_000);
});

test("groupAndCompute: settlement_flow_hint 미설정 → default_flow=null (Scenario 17)", () => {
  const sessions = [makeSession({ id: "s-1", project_id: PROJ_A })];
  const projects = new Map([
    [
      PROJ_A,
      {
        id: PROJ_A,
        instructor_id: INSTR_A,
        hourly_rate_krw: 100_000,
        instructor_share_pct: 70,
        settlement_flow_hint: null, // 운영자가 선택 필요
      },
    ],
  ]);
  const rows = groupAndCompute(sessions, projects);
  assert.equal(rows[0].default_flow, null);
});

test("groupAndCompute: 잘못된 flow_hint(string)도 default_flow=null", () => {
  const sessions = [makeSession({ id: "s-1", project_id: PROJ_A })];
  const projects = new Map([
    [
      PROJ_A,
      {
        id: PROJ_A,
        instructor_id: INSTR_A,
        hourly_rate_krw: 100_000,
        instructor_share_pct: 70,
        settlement_flow_hint: "invalid_flow",
      },
    ],
  ]);
  const rows = groupAndCompute(sessions, projects);
  assert.equal(rows[0].default_flow, null);
});

test("groupAndCompute: instructor_share_pct가 string으로 와도 동작 (Drizzle numeric → string)", () => {
  const sessions = [makeSession({ id: "s-1", project_id: PROJ_A })];
  const projects = new Map([
    [
      PROJ_A,
      {
        id: PROJ_A,
        instructor_id: INSTR_A,
        hourly_rate_krw: 100_000,
        instructor_share_pct: "70.00", // postgres numeric → string
        settlement_flow_hint: "corporate",
      },
    ],
  ]);
  const rows = groupAndCompute(sessions, projects);
  assert.equal(rows[0].instructor_fee_per_hour, 70_000);
});

// =============================================================================
// generateSettlementsForPeriod — Mock-based 통합 시나리오
// =============================================================================

interface ResponseStub {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number;
}

function mockSupa(responses: ResponseStub[]) {
  const calls: Array<{ table: string; method: string; args?: unknown[] }> = [];
  let cursor = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = (table: string): any => {
    const chain: Record<string, unknown> = {};
    const wrap =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    [
      "select",
      "insert",
      "update",
      "delete",
      "eq",
      "in",
      "is",
      "gte",
      "lte",
      "order",
      "limit",
      "range",
    ].forEach((m) => (chain[m] = wrap(m)));
    chain.maybeSingle = () => {
      const r = responses[cursor++] ?? { data: null, error: null };
      return Promise.resolve(r);
    };
    chain.single = () => {
      const r = responses[cursor++] ?? { data: null, error: null };
      return Promise.resolve(r);
    };
    chain.then = (onFulfilled: (r: ResponseStub) => unknown) => {
      const r = responses[cursor++] ?? { data: null, error: null };
      return Promise.resolve(onFulfilled(r));
    };
    return chain;
  };
  return { from: builder, calls };
}

test("Scenario 1: 단일 프로젝트 5세션 → settlement 1건 + 5 link", async () => {
  const sessionRows: LectureSession[] = [
    makeSession({ id: "s-1", project_id: PROJ_A }),
    makeSession({ id: "s-2", project_id: PROJ_A }),
    makeSession({ id: "s-3", project_id: PROJ_A }),
    makeSession({ id: "s-4", project_id: PROJ_A }),
    makeSession({ id: "s-5", project_id: PROJ_A }),
  ];
  const mock = mockSupa([
    { data: [], error: null }, // settlement_sessions linked query (empty)
    { data: sessionRows, error: null }, // unbilled completed sessions
    {
      data: [
        {
          id: PROJ_A,
          instructor_id: INSTR_A,
          hourly_rate_krw: 100_000,
          instructor_share_pct: 70,
          settlement_flow_hint: "corporate",
        },
      ],
      error: null,
    }, // project metas
    { data: { id: "settle-1" }, error: null }, // settlement INSERT
    {
      data: [
        { lecture_session_id: "s-1" },
        { lecture_session_id: "s-2" },
        { lecture_session_id: "s-3" },
        { lecture_session_id: "s-4" },
        { lecture_session_id: "s-5" },
      ],
      error: null,
    }, // settlement_sessions INSERT
  ]);
  const r = await generateSettlementsForPeriod(mock as never, {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
  });
  assert.equal(r.ok, true);
  assert.equal(r.createdCount, 1);
  assert.equal(r.linkedCount, 5);
});

test("Scenario 5: 미청구 세션 0건 → NO_UNBILLED_SESSIONS 에러", async () => {
  const mock = mockSupa([
    { data: [], error: null }, // linked query
    { data: [], error: null }, // unbilled — empty
  ]);
  const r = await generateSettlementsForPeriod(mock as never, {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, SESSION_ERRORS.NO_UNBILLED_SESSIONS);
  assert.equal(r.createdCount, 0);
  assert.equal(r.linkedCount, 0);
});

test("Scenario 10 (HIGH-2): junction UNIQUE 위반 → ALREADY_BILLED 에러", async () => {
  const sessions = [
    makeSession({ id: "s-1", project_id: PROJ_A }),
    makeSession({ id: "s-2", project_id: PROJ_A }),
  ];
  const mock = mockSupa([
    { data: [], error: null }, // linked query (보였지만 race로 다른 Tx가 먼저)
    { data: sessions, error: null }, // unbilled
    {
      data: [
        {
          id: PROJ_A,
          instructor_id: INSTR_A,
          hourly_rate_krw: 100_000,
          instructor_share_pct: 70,
          settlement_flow_hint: "corporate",
        },
      ],
      error: null,
    }, // project metas
    { data: { id: "settle-1" }, error: null }, // settlement INSERT
    {
      data: null,
      error: { message: 'duplicate key value violates unique constraint "settlement_sessions_lecture_session_unique"', code: "23505" },
    }, // settlement_sessions INSERT — UNIQUE violation
    { data: null, error: null }, // 보상 — settlements DELETE (best-effort)
  ]);
  const r = await generateSettlementsForPeriod(mock as never, {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, SESSION_ERRORS.ALREADY_BILLED);
  // 보상 후 createdCount는 0으로 복원
  assert.equal(r.createdCount, 0);
  assert.ok(r.rejectedSessionIds);
  assert.equal(r.rejectedSessionIds!.length, 2);
});

test("Scenario 17: settlement_flow_hint 없음 + override 없음 → 에러", async () => {
  const sessions = [makeSession({ id: "s-1", project_id: PROJ_A })];
  const mock = mockSupa([
    { data: [], error: null },
    { data: sessions, error: null },
    {
      data: [
        {
          id: PROJ_A,
          instructor_id: INSTR_A,
          hourly_rate_krw: 100_000,
          instructor_share_pct: 70,
          settlement_flow_hint: null,
        },
      ],
      error: null,
    },
  ]);
  const r = await generateSettlementsForPeriod(mock as never, {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
  });
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /흐름/);
});

test("Scenario 17: flow override → settlement INSERT 정상", async () => {
  const sessions = [makeSession({ id: "s-1", project_id: PROJ_A })];
  const mock = mockSupa([
    { data: [], error: null },
    { data: sessions, error: null },
    {
      data: [
        {
          id: PROJ_A,
          instructor_id: INSTR_A,
          hourly_rate_krw: 100_000,
          instructor_share_pct: 70,
          settlement_flow_hint: null,
        },
      ],
      error: null,
    },
    { data: { id: "settle-x" }, error: null },
    { data: [{ lecture_session_id: "s-1" }], error: null },
  ]);
  const r = await generateSettlementsForPeriod(mock as never, {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    flowOverrides: { [PROJ_A]: "government" },
    taxRateOverrides: { [PROJ_A]: 3.3 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.createdCount, 1);
});

// SPEC-PAYOUT-002 v0.1.3 + SPEC-RECEIPT-001 v0.2.1 cross-SPEC contract (Option A) ===
// flow='client_direct'일 때 instructor_remittance_amount_krw 자동 채움 검증.

test("client_direct flow override → instructor_remittance_amount_krw 자동 populate (Option A)", async () => {
  const sessions = [
    makeSession({ id: "s-1", project_id: PROJ_A, hours: 5.0 }),
  ];
  // 산식: hourly_rate=100_000 × 5h = 500_000 (business_amount).
  //       instructor_fee = floor(100_000 × 70 / 100) × 5 = 350_000.
  //       profit = 500_000 - 350_000 = 150_000 → instructor_remittance_amount_krw.
  const mock = mockSupa([
    { data: [], error: null },
    { data: sessions, error: null },
    {
      data: [
        {
          id: PROJ_A,
          instructor_id: INSTR_A,
          hourly_rate_krw: 100_000,
          instructor_share_pct: 70,
          settlement_flow_hint: null,
        },
      ],
      error: null,
    },
    { data: { id: "settle-cd" }, error: null },
    { data: [{ lecture_session_id: "s-1" }], error: null },
  ]);
  const r = await generateSettlementsForPeriod(mock as never, {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    flowOverrides: { [PROJ_A]: "client_direct" },
    taxRateOverrides: { [PROJ_A]: 3.3 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.createdCount, 1);

  // settlements INSERT 호출 캡쳐 — instructor_remittance_amount_krw가 페이로드에 포함되어야.
  const insertCall = mock.calls.find(
    (c) => c.table === "settlements" && c.method === "insert",
  );
  assert.ok(insertCall, "settlements insert call exists");
  const payload = insertCall!.args?.[0] as Record<string, unknown>;
  assert.equal(payload.settlement_flow, "client_direct");
  // 150,000 = 500,000 - 350,000.
  assert.equal(payload.instructor_remittance_amount_krw, 150_000);
});

test("corporate flow → instructor_remittance_amount_krw NOT in payload (Option A)", async () => {
  const sessions = [makeSession({ id: "s-1", project_id: PROJ_A })];
  const mock = mockSupa([
    { data: [], error: null },
    { data: sessions, error: null },
    {
      data: [
        {
          id: PROJ_A,
          instructor_id: INSTR_A,
          hourly_rate_krw: 100_000,
          instructor_share_pct: 70,
          settlement_flow_hint: "corporate",
        },
      ],
      error: null,
    },
    { data: { id: "settle-c" }, error: null },
    { data: [{ lecture_session_id: "s-1" }], error: null },
  ]);
  const r = await generateSettlementsForPeriod(mock as never, {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
  });
  assert.equal(r.ok, true);

  const insertCall = mock.calls.find(
    (c) => c.table === "settlements" && c.method === "insert",
  );
  const payload = insertCall!.args?.[0] as Record<string, unknown>;
  assert.equal(payload.settlement_flow, "corporate");
  // corporate flow는 instructor_remittance_amount_krw를 추가하지 않음 (NULL 유지).
  assert.ok(
    !("instructor_remittance_amount_krw" in payload),
    `corporate flow should not populate instructor_remittance_amount_krw, got: ${JSON.stringify(payload)}`,
  );
});

test("client_direct + settlement_flow_hint='client_direct' → 자동 default_flow 인식", () => {
  const sessions = [makeSession({ id: "s-1", project_id: PROJ_A })];
  const projects = new Map([
    [
      PROJ_A,
      {
        id: PROJ_A,
        instructor_id: INSTR_A,
        hourly_rate_krw: 100_000,
        instructor_share_pct: 70,
        settlement_flow_hint: "client_direct",
      },
    ],
  ]);
  const rows = groupAndCompute(sessions, projects);
  assert.equal(rows[0].default_flow, "client_direct");
});

test("buildSettlementPreview: 미청구 0건 → unbilledCount=0", async () => {
  const mock = mockSupa([
    { data: [], error: null },
    { data: [], error: null },
  ]);
  const r = await buildSettlementPreview(mock as never, {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
  });
  assert.equal(r.unbilledCount, 0);
  assert.equal(r.projectCount, 0);
  assert.equal(r.rows.length, 0);
});
