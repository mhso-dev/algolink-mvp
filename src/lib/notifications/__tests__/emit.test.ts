// SPEC-NOTIFY-001 §M2 — emit 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emitNotification } from "../emit";
import { NOTIF_LOG_PREFIX } from "../constants";
import {
  buildSupaMock,
  captureLogs,
  UUID_RECIPIENT,
  UUID_INSTRUCTOR,
  UUID_PROJECT,
  UUID_NOTIF,
  type NotifRow,
} from "./_helpers";

test("emitNotification: 정상 — INSERT + 콘솔 로그 1줄 + ok:true", async () => {
  const supa = buildSupaMock();
  const log = captureLogs();
  try {
    const r = await emitNotification(supa, {
      recipientId: UUID_RECIPIENT,
      type: "assignment_request",
      title: "테스트",
      body: "본문",
      linkUrl: "/me",
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.id, UUID_NOTIF);
    assert.equal(supa._insertCalls.length, 1);
    assert.equal(log.lines.length, 1);
    assert.ok(log.lines[0].startsWith(`${NOTIF_LOG_PREFIX} assignment_request →`));
    assert.ok(log.lines[0].includes(UUID_RECIPIENT));
  } finally {
    log.restore();
  }
});

test("emitNotification: logContext 제공 → 콘솔 로그가 logContext 사용", async () => {
  const supa = buildSupaMock();
  const log = captureLogs();
  try {
    await emitNotification(supa, {
      recipientId: UUID_RECIPIENT,
      type: "assignment_request",
      title: "X",
      logContext: `instructor_id=${UUID_INSTRUCTOR} project_id=${UUID_PROJECT} rank=1`,
    });
    assert.equal(log.lines.length, 1);
    assert.equal(
      log.lines[0],
      `${NOTIF_LOG_PREFIX} assignment_request → instructor_id=${UUID_INSTRUCTOR} project_id=${UUID_PROJECT} rank=1`,
    );
  } finally {
    log.restore();
  }
});

test("emitNotification: settlement_requested logContext — SPEC-PAYOUT-001 형식", async () => {
  const supa = buildSupaMock();
  const log = captureLogs();
  try {
    await emitNotification(supa, {
      recipientId: UUID_RECIPIENT,
      type: "settlement_requested",
      title: "정산 요청",
      logContext: `instructor_id=${UUID_INSTRUCTOR} settlement_id=${UUID_PROJECT}`,
    });
    const RE = /^\[notif\] settlement_requested → instructor_id=[\w-]{36} settlement_id=[\w-]{36}$/;
    assert.match(log.lines[0], RE);
  } finally {
    log.restore();
  }
});

test("emitNotification: 잘못된 recipientId(uuid 아님) → validation 실패, INSERT 시도 없음", async () => {
  const supa = buildSupaMock();
  const log = captureLogs();
  try {
    const r = await emitNotification(supa, {
      recipientId: "not-uuid",
      type: "assignment_request",
      title: "X",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "validation");
    assert.equal(supa._insertCalls.length, 0);
    assert.equal(log.lines.length, 0);
  } finally {
    log.restore();
  }
});

test("emitNotification: 잘못된 type → validation 실패", async () => {
  const supa = buildSupaMock();
  const log = captureLogs();
  try {
    const r = await emitNotification(supa, {
      type: "unknown_type" as never,
      recipientId: UUID_RECIPIENT,
      title: "X",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "validation");
  } finally {
    log.restore();
  }
});

test("emitNotification: title 200자 초과 → validation 실패", async () => {
  const supa = buildSupaMock();
  const log = captureLogs();
  try {
    const r = await emitNotification(supa, {
      recipientId: UUID_RECIPIENT,
      type: "assignment_request",
      title: "x".repeat(201),
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "validation");
  } finally {
    log.restore();
  }
});

test("emitNotification: linkUrl이 / 로 시작하지 않음 → validation 실패", async () => {
  const supa = buildSupaMock();
  const log = captureLogs();
  try {
    const r = await emitNotification(supa, {
      recipientId: UUID_RECIPIENT,
      type: "assignment_request",
      title: "X",
      linkUrl: "https://evil.com",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "validation");
  } finally {
    log.restore();
  }
});

test("emitNotification: dedupKey 제공 + 24h 내 동일 (recipient,type,linkUrl) 존재 → duplicate", async () => {
  const seedRow: NotifRow = {
    id: UUID_NOTIF,
    recipient_id: UUID_RECIPIENT,
    type: "assignment_request",
    title: "기존",
    body: null,
    link_url: "/me",
    read_at: null,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  };
  const supa = buildSupaMock({ rows: [seedRow] });
  const log = captureLogs();
  try {
    const r = await emitNotification(supa, {
      recipientId: UUID_RECIPIENT,
      type: "assignment_request",
      title: "신규",
      linkUrl: "/me",
      dedupKey: "x",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "duplicate");
    assert.equal(supa._insertCalls.length, 0);
  } finally {
    log.restore();
  }
});

test("emitNotification: dedupKey 미제공 → 중복 검사 skip + INSERT", async () => {
  const seedRow: NotifRow = {
    id: UUID_NOTIF,
    recipient_id: UUID_RECIPIENT,
    type: "assignment_request",
    title: "기존",
    body: null,
    link_url: "/me",
    read_at: null,
    created_at: new Date().toISOString(),
  };
  const supa = buildSupaMock({ rows: [seedRow] });
  const log = captureLogs();
  try {
    const r = await emitNotification(supa, {
      recipientId: UUID_RECIPIENT,
      type: "assignment_request",
      title: "신규",
      linkUrl: "/me",
    });
    assert.equal(r.ok, true);
    assert.equal(supa._insertCalls.length, 1);
  } finally {
    log.restore();
  }
});

test("emitNotification: INSERT 실패 (RLS code 42501) → reason: rls + console.error", async () => {
  const supa = buildSupaMock({ insertError: { code: "42501", message: "RLS" } });
  const log = captureLogs();
  try {
    const r = await emitNotification(supa, {
      recipientId: UUID_RECIPIENT,
      type: "assignment_request",
      title: "X",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "rls");
    assert.equal(log.errors.length, 1);
    assert.equal(log.lines.length, 0);
  } finally {
    log.restore();
  }
});

test("emitNotification: INSERT 실패 (기타 에러) → reason: db", async () => {
  const supa = buildSupaMock({ insertError: { code: "23505", message: "unique" } });
  const log = captureLogs();
  try {
    const r = await emitNotification(supa, {
      recipientId: UUID_RECIPIENT,
      type: "assignment_request",
      title: "X",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "db");
  } finally {
    log.restore();
  }
});
