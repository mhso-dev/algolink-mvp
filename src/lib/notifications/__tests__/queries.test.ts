// SPEC-NOTIFY-001 §M2 — queries 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listMyNotifications,
  getUnreadCount,
  getRecentNotifications,
  markAsRead,
  markAllAsRead,
} from "../queries";
import {
  buildSupaMock,
  UUID_RECIPIENT,
  UUID_OTHER,
  UUID_NOTIF,
  type NotifRow,
} from "./_helpers";

function row(i: number, overrides: Partial<NotifRow> = {}): NotifRow {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
    recipient_id: UUID_RECIPIENT,
    type: "assignment_request",
    title: `T${i}`,
    body: null,
    link_url: null,
    read_at: null,
    created_at: new Date(2026, 3, 28, 10, 0, i).toISOString(),
    ...overrides,
  };
}

test("listMyNotifications: 페이지네이션 — page=1 first 20", async () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(i));
  const supa = buildSupaMock({ rows });
  const r = await listMyNotifications(supa, { userId: UUID_RECIPIENT, page: 1, pageSize: 20 });
  assert.equal(r.items.length, 20);
  assert.equal(r.total, 25);
  assert.equal(r.totalPages, 2);
});

test("listMyNotifications: page=2 → 5건", async () => {
  const rows = Array.from({ length: 25 }, (_, i) => row(i));
  const supa = buildSupaMock({ rows });
  const r = await listMyNotifications(supa, { userId: UUID_RECIPIENT, page: 2, pageSize: 20 });
  assert.equal(r.items.length, 5);
});

test("listMyNotifications: types 필터 적용", async () => {
  const rows = [
    row(1, { type: "assignment_request" }),
    row(2, { type: "schedule_conflict" }),
    row(3, { type: "settlement_requested" }),
  ];
  const supa = buildSupaMock({ rows });
  const r = await listMyNotifications(supa, {
    userId: UUID_RECIPIENT,
    page: 1,
    types: ["schedule_conflict"],
  });
  assert.equal(r.total, 1);
  assert.equal(r.items[0]?.type, "schedule_conflict");
});

test("listMyNotifications: read='unread' → read_at NULL만", async () => {
  const rows = [
    row(1),
    row(2, { read_at: new Date().toISOString() }),
    row(3),
  ];
  const supa = buildSupaMock({ rows });
  const r = await listMyNotifications(supa, { userId: UUID_RECIPIENT, page: 1, read: "unread" });
  assert.equal(r.total, 2);
});

test("listMyNotifications: read='read' → read_at NOT NULL만", async () => {
  const rows = [
    row(1),
    row(2, { read_at: new Date().toISOString() }),
  ];
  const supa = buildSupaMock({ rows });
  const r = await listMyNotifications(supa, { userId: UUID_RECIPIENT, page: 1, read: "read" });
  assert.equal(r.total, 1);
});

test("listMyNotifications: 다른 사용자 row 제외 (RLS proxy)", async () => {
  const rows = [
    row(1),
    row(2, { recipient_id: UUID_OTHER }),
  ];
  const supa = buildSupaMock({ rows });
  const r = await listMyNotifications(supa, { userId: UUID_RECIPIENT, page: 1 });
  assert.equal(r.total, 1);
});

test("getUnreadCount: 정확한 카운트", async () => {
  const rows = [
    row(1),
    row(2, { read_at: new Date().toISOString() }),
    row(3),
    row(4),
  ];
  const supa = buildSupaMock({ rows });
  const c = await getUnreadCount(supa, UUID_RECIPIENT);
  assert.equal(c, 3);
});

test("getRecentNotifications: 최신순 limit 적용", async () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(i));
  const supa = buildSupaMock({ rows });
  const r = await getRecentNotifications(supa, UUID_RECIPIENT, 10);
  assert.equal(r.length, 10);
  // 최신순 → i=11이 가장 최근
  assert.equal(r[0]?.title, "T11");
});

test("markAsRead: read_at 업데이트 + ok:true", async () => {
  const rows = [row(1, { id: UUID_NOTIF })];
  const supa = buildSupaMock({ rows });
  const r = await markAsRead(supa, UUID_NOTIF);
  assert.equal(r.ok, true);
  assert.ok(supa._rows[0]?.read_at !== null);
});

test("markAllAsRead: 본인 unread 일괄 + count 반환", async () => {
  const rows = [
    row(1),
    row(2),
    row(3, { read_at: new Date().toISOString() }),
  ];
  const supa = buildSupaMock({ rows });
  const r = await markAllAsRead(supa, UUID_RECIPIENT);
  assert.equal(r.ok, true);
  assert.equal(r.count, 2);
});
