// SPEC-NOTIFY-001 §M3 — dday_unprocessed 트리거 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDdayUnprocessed } from "../../triggers/dday-unprocessed";
import { buildTriggerSupa } from "./_supa";

const OPERATOR = "22222222-2222-4222-8222-222222222222";

test("checkDdayUnprocessed: settlement 7일 미처리 + project 7일 미배정 → emit 2건", async () => {
  const supa = buildTriggerSupa({
    settlements: [
      {
        id: "s1",
        status: "requested",
        operator_id: OPERATOR,
        project_title: "정산-A",
        requested_at: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
      },
    ],
    projects: [
      {
        id: "p1",
        title: "의뢰-A",
        status: "proposal",
        operator_id: OPERATOR,
        created_at: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
      },
    ],
    notifications: [],
  });
  const rs = await checkDdayUnprocessed(supa);
  assert.equal(rs.length, 2);
  assert.equal(supa.inserts.notifications.length, 2);
  const links = supa.inserts.notifications.map((n) => n.link_url);
  assert.ok(links.includes("/settlements/s1"));
  assert.ok(links.includes("/projects/p1"));
});

test("checkDdayUnprocessed: 7일 미경과 → emit 0건", async () => {
  const supa = buildTriggerSupa({
    settlements: [
      {
        id: "s1",
        status: "requested",
        operator_id: OPERATOR,
        project_title: "X",
        requested_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
      },
    ],
    projects: [
      {
        id: "p1",
        title: "X",
        status: "proposal",
        operator_id: OPERATOR,
        created_at: new Date(Date.now() - 3 * 86400 * 1000).toISOString(),
      },
    ],
    notifications: [],
  });
  const rs = await checkDdayUnprocessed(supa);
  assert.equal(rs.length, 0);
});

test("checkDdayUnprocessed: settlement status != requested → 제외", async () => {
  const supa = buildTriggerSupa({
    settlements: [
      {
        id: "s1",
        status: "paid",
        operator_id: OPERATOR,
        project_title: "X",
        requested_at: new Date(Date.now() - 30 * 86400 * 1000).toISOString(),
      },
    ],
    projects: [],
    notifications: [],
  });
  const rs = await checkDdayUnprocessed(supa);
  assert.equal(rs.length, 0);
});

test("checkDdayUnprocessed: 동일 settlement 24h 내 dedup", async () => {
  const supa = buildTriggerSupa({
    settlements: [
      {
        id: "s1",
        status: "requested",
        operator_id: OPERATOR,
        project_title: "X",
        requested_at: new Date(Date.now() - 8 * 86400 * 1000).toISOString(),
      },
    ],
    projects: [],
    notifications: [
      {
        id: "n1",
        recipient_id: OPERATOR,
        type: "dday_unprocessed",
        link_url: "/settlements/s1",
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ],
  });
  const rs = await checkDdayUnprocessed(supa);
  assert.equal(rs.length, 1);
  assert.equal(rs[0].ok, false);
});
