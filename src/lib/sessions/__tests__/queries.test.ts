// SPEC-PAYOUT-002 §M3 — sessions/queries.ts mock-based 단위 테스트.
// REQ-PAYOUT002-SESSIONS-004, REQ-PAYOUT002-EXCEPT-001/-002/-003.
//
// Supabase client는 thenable 체이너이므로 fixture로 mock — 시그니처 + 흐름 검증.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bulkUpsertSessions,
  cancelSession,
  rescheduleSession,
  bulkCancelFutureSessions,
  countFutureSessions,
} from "../queries";
import { SESSION_ERRORS } from "../errors";

const VALID_UUID = "12345678-1234-1234-1234-123456789012";

// ------ thenable Mock builder ------
type Mock = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  calls: Array<{ table: string; method: string; args?: unknown[] }>;
};

interface ResponseStub {
  data?: unknown;
  error?: { message: string } | null;
  count?: number;
}

function mockSupa(responses: ResponseStub[]): Mock {
  const calls: Array<{ table: string; method: string; args?: unknown[] }> = [];
  let cursor = 0;
  const builder = (table: string) => {
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

// =============================================================================
// bulkUpsertSessions
// =============================================================================

test("bulkUpsertSessions: 신규 행만 INSERT, 0 update", async () => {
  const mock = mockSupa([{ data: [{ id: "s-1" }, { id: "s-2" }], error: null }]);
  const r = await bulkUpsertSessions(mock as never, [
    { project_id: VALID_UUID, instructor_id: null, date: "2026-05-03", hours: 2.0 },
    { project_id: VALID_UUID, instructor_id: null, date: "2026-05-10", hours: 2.0 },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.insertedCount, 2);
  assert.equal(r.updatedCount, 0);
  assert.equal(mock.calls.find((c) => c.method === "insert")?.table, "lecture_sessions");
});

test("bulkUpsertSessions: id가 있는 행만 UPDATE", async () => {
  const mock = mockSupa([
    { data: [{ id: "s-1" }], error: null }, // update select
  ]);
  const r = await bulkUpsertSessions(mock as never, [
    {
      id: "s-1",
      project_id: VALID_UUID,
      instructor_id: null,
      date: "2026-05-03",
      hours: 3.0,
    },
  ]);
  assert.equal(r.ok, true);
  assert.equal(r.insertedCount, 0);
  assert.equal(r.updatedCount, 1);
});

test("bulkUpsertSessions: INSERT 실패 → ok=false", async () => {
  const mock = mockSupa([{ data: null, error: { message: "DB error" } }]);
  const r = await bulkUpsertSessions(mock as never, [
    { project_id: VALID_UUID, instructor_id: null, date: "2026-05-03", hours: 2.0 },
  ]);
  assert.equal(r.ok, false);
});

// =============================================================================
// cancelSession (REQ-PAYOUT002-EXCEPT-001)
// =============================================================================

test("cancelSession: planned → canceled, 사유 notes append", async () => {
  const mock = mockSupa([
    { data: { status: "planned", notes: "기존 메모" }, error: null }, // SELECT
    { data: [{ id: "s-1" }], error: null }, // UPDATE
  ]);
  const r = await cancelSession(mock as never, {
    sessionId: "s-1",
    reason: "강사 개인 사정",
  });
  assert.equal(r.ok, true);
});

test("cancelSession: 이미 completed인 세션 거부 (STATUS_FROZEN)", async () => {
  const mock = mockSupa([
    { data: { status: "completed", notes: null }, error: null },
  ]);
  const r = await cancelSession(mock as never, { sessionId: "s-1" });
  assert.equal(r.ok, false);
  assert.equal(r.error, SESSION_ERRORS.STATUS_FROZEN);
});

test("cancelSession: 세션 없음 → 에러", async () => {
  const mock = mockSupa([{ data: null, error: null }]);
  const r = await cancelSession(mock as never, { sessionId: "s-1" });
  assert.equal(r.ok, false);
});

// =============================================================================
// rescheduleSession (REQ-PAYOUT002-EXCEPT-002, LOW-8)
// =============================================================================

test("rescheduleSession: 원본 → rescheduled, 새 row INSERT (notes carry-forward)", async () => {
  const mock = mockSupa([
    {
      data: {
        id: "s-1",
        project_id: VALID_UUID,
        instructor_id: null,
        hours: "2.0",
        status: "planned",
        notes: "원본 메모 — 화이트보드 준비",
      },
      error: null,
    }, // SELECT 원본
    { data: [{ id: "s-1" }], error: null }, // UPDATE rescheduled
    { data: { id: "s-2" }, error: null }, // INSERT new
  ]);
  const r = await rescheduleSession(mock as never, {
    sessionId: "s-1",
    newDate: "2026-05-20",
  });
  assert.equal(r.ok, true);
  assert.equal(r.newSessionId, "s-2");
});

test("rescheduleSession: 운영자 amend notes 우선 (carry-forward override)", async () => {
  const mock = mockSupa([
    {
      data: {
        id: "s-1",
        project_id: VALID_UUID,
        instructor_id: null,
        hours: "2.0",
        status: "planned",
        notes: "원본 메모",
      },
      error: null,
    },
    { data: [{ id: "s-1" }], error: null },
    { data: { id: "s-2" }, error: null },
  ]);
  const r = await rescheduleSession(mock as never, {
    sessionId: "s-1",
    newDate: "2026-05-20",
    notes: "amend된 새 메모",
  });
  assert.equal(r.ok, true);
});

test("rescheduleSession: 이미 completed인 세션 거부", async () => {
  const mock = mockSupa([
    {
      data: {
        id: "s-1",
        project_id: VALID_UUID,
        instructor_id: null,
        hours: "2.0",
        status: "completed",
        notes: null,
      },
      error: null,
    },
  ]);
  const r = await rescheduleSession(mock as never, {
    sessionId: "s-1",
    newDate: "2026-05-20",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, SESSION_ERRORS.STATUS_FROZEN);
});

// =============================================================================
// bulkCancelFutureSessions (REQ-PAYOUT002-EXCEPT-003)
// =============================================================================

test("bulkCancelFutureSessions: 미래 planned 세션 모두 canceled", async () => {
  const mock = mockSupa([
    {
      data: [
        { id: "f-1", notes: null },
        { id: "f-2", notes: "기존" },
        { id: "f-3", notes: null },
      ],
      error: null,
    }, // SELECT 미래 planned
    { data: [{ id: "f-1" }], error: null }, // UPDATE f-1
    { data: [{ id: "f-2" }], error: null }, // UPDATE f-2
    { data: [{ id: "f-3" }], error: null }, // UPDATE f-3
  ]);
  const r = await bulkCancelFutureSessions(mock as never, {
    projectId: VALID_UUID,
    reason: "강사 개인 사정",
    today: "2026-05-15",
  });
  assert.equal(r.ok, true);
  assert.equal(r.canceledCount, 3);
});

test("bulkCancelFutureSessions: 미래 세션 0건 → canceledCount=0", async () => {
  const mock = mockSupa([{ data: [], error: null }]);
  const r = await bulkCancelFutureSessions(mock as never, {
    projectId: VALID_UUID,
    reason: "테스트",
    today: "2026-05-15",
  });
  assert.equal(r.ok, true);
  assert.equal(r.canceledCount, 0);
});

// =============================================================================
// countFutureSessions
// =============================================================================

test("countFutureSessions: count 반환", async () => {
  const mock = mockSupa([{ count: 3, error: null }]);
  const n = await countFutureSessions(mock as never, {
    projectId: VALID_UUID,
    today: "2026-05-15",
  });
  assert.equal(n, 3);
});
