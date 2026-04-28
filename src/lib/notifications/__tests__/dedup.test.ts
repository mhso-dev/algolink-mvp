// SPEC-NOTIFY-001 §M2 — dedup 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRecentDuplicate } from "../dedup";
import { buildSupaMock, UUID_RECIPIENT, UUID_NOTIF, type NotifRow } from "./_helpers";

const seedRow = (overrides: Partial<NotifRow> = {}): NotifRow => ({
  id: UUID_NOTIF,
  recipient_id: UUID_RECIPIENT,
  type: "assignment_request",
  title: "X",
  body: null,
  link_url: "/me",
  read_at: null,
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  ...overrides,
});

test("hasRecentDuplicate: 24h 내 동일 키 → true", async () => {
  const supa = buildSupaMock({ rows: [seedRow()] });
  const r = await hasRecentDuplicate(
    supa,
    { recipientId: UUID_RECIPIENT, type: "assignment_request", linkUrl: "/me" },
    24,
  );
  assert.equal(r, true);
});

test("hasRecentDuplicate: 24h 외 (25h 전) → false", async () => {
  const supa = buildSupaMock({
    rows: [seedRow({ created_at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() })],
  });
  const r = await hasRecentDuplicate(
    supa,
    { recipientId: UUID_RECIPIENT, type: "assignment_request", linkUrl: "/me" },
    24,
  );
  assert.equal(r, false);
});

test("hasRecentDuplicate: linkUrl 불일치 → false", async () => {
  const supa = buildSupaMock({ rows: [seedRow({ link_url: "/projects/abc" })] });
  const r = await hasRecentDuplicate(
    supa,
    { recipientId: UUID_RECIPIENT, type: "assignment_request", linkUrl: "/me" },
    24,
  );
  assert.equal(r, false);
});

test("hasRecentDuplicate: linkUrl 미제공 → (recipient,type) 일치만으로 true", async () => {
  const supa = buildSupaMock({ rows: [seedRow({ link_url: "/anything" })] });
  const r = await hasRecentDuplicate(
    supa,
    { recipientId: UUID_RECIPIENT, type: "assignment_request" },
    24,
  );
  assert.equal(r, true);
});

test("hasRecentDuplicate: recipient 다름 → false (RLS proxy)", async () => {
  const supa = buildSupaMock({ rows: [seedRow({ recipient_id: "00000000-0000-4000-8000-000000000000" })] });
  const r = await hasRecentDuplicate(
    supa,
    { recipientId: UUID_RECIPIENT, type: "assignment_request", linkUrl: "/me" },
    24,
  );
  assert.equal(r, false);
});
