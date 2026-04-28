// SPEC-PAYOUT-001 §M6 — mail-stub 단위 테스트 (Supabase 모킹 + console.log 캡처).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sendSettlementRequestStub } from "../mail-stub";
import { PAYOUT_ERRORS } from "../errors";

const UUID_INSTRUCTOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UUID_SETTLEMENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const UUID_NOTIF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const LOG_RE =
  /^\[notif\] settlement_requested → instructor_id=[\w-]{36} settlement_id=[\w-]{36}$/;

function buildSupabaseStub(opts: {
  resolveInstructorUserId?: string | null;
  insertError?: { message: string } | null;
}) {
  return {
    from(table: string) {
      if (table === "instructors") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  opts.resolveInstructorUserId !== undefined
                    ? { user_id: opts.resolveInstructorUserId }
                    : { user_id: UUID_USER },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          insert: (_payload: unknown) => ({
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            select: (_cols: string) => ({
              single: async () =>
                opts.insertError
                  ? { data: null, error: opts.insertError }
                  : { data: { id: UUID_NOTIF }, error: null },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

function withCapturedLog(): { restore: () => void; lines: string[] } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  return {
    lines,
    restore: () => {
      console.log = original;
    },
  };
}

test("sendSettlementRequestStub: 정상 케이스 — notifications INSERT + 콘솔 로그 1줄", async () => {
  const supabase = buildSupabaseStub({});
  const log = withCapturedLog();
  try {
    const r = await sendSettlementRequestStub(supabase, {
      settlementId: UUID_SETTLEMENT,
      instructorId: UUID_INSTRUCTOR,
      projectTitle: "프로젝트 X",
      amounts: {
        businessKrw: 5000000,
        feeKrw: 3000000,
        profitKrw: 2000000,
        taxKrw: 0,
      },
    });
    assert.equal(r.ok, true);
    assert.equal(r.notificationId, UUID_NOTIF);
    assert.equal(log.lines.length, 1);
    assert.match(log.lines[0], LOG_RE);
    assert.ok(log.lines[0].includes(UUID_INSTRUCTOR));
    assert.ok(log.lines[0].includes(UUID_SETTLEMENT));
  } finally {
    log.restore();
  }
});

test("sendSettlementRequestStub: instructors.user_id null → MAIL_STUB_FAILED", async () => {
  const supabase = buildSupabaseStub({ resolveInstructorUserId: null });
  const log = withCapturedLog();
  try {
    const r = await sendSettlementRequestStub(supabase, {
      settlementId: UUID_SETTLEMENT,
      instructorId: UUID_INSTRUCTOR,
      projectTitle: "X",
      amounts: { businessKrw: 0, feeKrw: 0, profitKrw: 0, taxKrw: 0 },
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, PAYOUT_ERRORS.MAIL_STUB_FAILED);
    assert.equal(log.lines.length, 0);
  } finally {
    log.restore();
  }
});

test("sendSettlementRequestStub: notifications INSERT 실패 → MAIL_STUB_FAILED + 로그 없음", async () => {
  const supabase = buildSupabaseStub({
    insertError: { message: "RLS denied" },
  });
  const log = withCapturedLog();
  try {
    const r = await sendSettlementRequestStub(supabase, {
      settlementId: UUID_SETTLEMENT,
      instructorId: UUID_INSTRUCTOR,
      projectTitle: "X",
      amounts: { businessKrw: 0, feeKrw: 0, profitKrw: 0, taxKrw: 0 },
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, PAYOUT_ERRORS.MAIL_STUB_FAILED);
    assert.equal(log.lines.length, 0);
  } finally {
    log.restore();
  }
});
