// SPEC-PROJECT-SEARCH-001 — buildSearchClause + fetchProjectList 다중 컬럼 ILIKE 단위 테스트.
// Runs via: tsx --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchClause, fetchProjectList } from "../list-queries";
import type { ProjectListQuery } from "../list-query";

// --- buildSearchClause 단독 테스트 ---

test("buildSearchClause: null/undefined/공백 → null", () => {
  assert.equal(buildSearchClause(null), null);
  assert.equal(buildSearchClause(undefined), null);
  assert.equal(buildSearchClause(""), null);
  assert.equal(buildSearchClause("   "), null);
  assert.equal(buildSearchClause("\t\n  "), null);
});

test("buildSearchClause: 일반 문자열 → %wrapped%", () => {
  assert.equal(buildSearchClause("hello"), "%hello%");
  assert.equal(buildSearchClause("삼성"), "%삼성%");
});

test("buildSearchClause: 앞뒤 공백 제거", () => {
  assert.equal(buildSearchClause("  hello  "), "%hello%");
});

test("buildSearchClause: LIKE 메타문자 escape (% _ \\)", () => {
  // \ 가 먼저, 이후 % / _ 각각 escape
  assert.equal(buildSearchClause("100%"), "%100\\%%");
  assert.equal(buildSearchClause("a_b"), "%a\\_b%");
  assert.equal(buildSearchClause("c\\d"), "%c\\\\d%");
  assert.equal(buildSearchClause("x%y_z\\w"), "%x\\%y\\_z\\\\w%");
});

test("buildSearchClause: 100자 초과 시 100자로 절단", () => {
  const long = "a".repeat(150);
  const result = buildSearchClause(long);
  assert.ok(result !== null);
  // % + 100 chars + %  = 102
  assert.equal(result, `%${"a".repeat(100)}%`);
});

test("buildSearchClause: 100자 정확히는 그대로", () => {
  const exact = "b".repeat(100);
  assert.equal(buildSearchClause(exact), `%${"b".repeat(100)}%`);
});

// --- fetchProjectList 통합 (mock) ---

interface CallLog {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}

/**
 * 체이닝 가능한 supabase mock builder. 모든 메서드는 self 반환,
 * await 시 terminalResult 반환. 각 from() 마다 독립적인 builder 가 생성됨.
 */
function makeMockSupabase(opts?: {
  clientsResult?: { data: { id: string }[] | null };
  projectsResult?: { data: unknown[] | null; count: number | null; error: unknown };
}) {
  const log: CallLog[] = [];
  const clientsResult = opts?.clientsResult ?? { data: [] };
  const projectsResult = opts?.projectsResult ?? { data: [], count: 0, error: null };

  const makeBuilder = (table: string, terminal: unknown) => {
    const entry: CallLog = { table, calls: [] };
    log.push(entry);
    const record = (method: string, ...args: unknown[]) => {
      entry.calls.push({ method, args });
      return builder;
    };
    const builder: Record<string, unknown> = {
      select: (...a: unknown[]) => record("select", ...a),
      is: (...a: unknown[]) => record("is", ...a),
      ilike: (...a: unknown[]) => record("ilike", ...a),
      eq: (...a: unknown[]) => record("eq", ...a),
      in: (...a: unknown[]) => record("in", ...a),
      gte: (...a: unknown[]) => record("gte", ...a),
      lte: (...a: unknown[]) => record("lte", ...a),
      or: (...a: unknown[]) => record("or", ...a),
      order: (...a: unknown[]) => record("order", ...a),
      range: (...a: unknown[]) => record("range", ...a),
      // await 지원 — Promise 처럼 동작.
      then: (resolve: (v: unknown) => void) => resolve(terminal),
    };
    return builder;
  };

  return {
    log,
    from: (table: string) => {
      if (table === "clients") return makeBuilder("clients", clientsResult);
      return makeBuilder("projects", projectsResult);
    },
  };
}

const baseQuery: ProjectListQuery = {
  q: null,
  status: [],
  operatorId: null,
  clientId: null,
  startFrom: null,
  startTo: null,
  sort: "scheduled_at",
  order: "desc",
  page: 1,
  pageSize: 20,
};

function findCalls(log: CallLog[], table: string, method: string) {
  const entries = log.filter((e) => e.table === table);
  return entries.flatMap((e) => e.calls.filter((c) => c.method === method));
}

test("fetchProjectList: q 없음 → clients 조회 없음, .or() 미호출", async () => {
  const mock = makeMockSupabase();
  await fetchProjectList(mock, baseQuery);
  // clients 테이블 접근 자체가 없어야 한다.
  const clientsCalls = mock.log.filter((e) => e.table === "clients");
  assert.equal(clientsCalls.length, 0);
  // projects 에 .or() 호출 없음.
  assert.equal(findCalls(mock.log, "projects", "or").length, 0);
});

test("fetchProjectList: q 공백 → 검색 미적용", async () => {
  const mock = makeMockSupabase();
  await fetchProjectList(mock, { ...baseQuery, q: "   " });
  assert.equal(mock.log.filter((e) => e.table === "clients").length, 0);
  assert.equal(findCalls(mock.log, "projects", "or").length, 0);
});

test("fetchProjectList: q 있음 → clients ilike(company_name) + projects.or() 3-컬럼", async () => {
  const mock = makeMockSupabase({
    clientsResult: { data: [{ id: "c1" }, { id: "c2" }] },
  });
  await fetchProjectList(mock, { ...baseQuery, q: "samsung" });

  // clients 측: ilike("company_name", "%samsung%")
  const clientIlikes = findCalls(mock.log, "clients", "ilike");
  assert.equal(clientIlikes.length, 1);
  assert.deepEqual(clientIlikes[0].args, ["company_name", "%samsung%"]);

  // projects 측: .or("title.ilike.%samsung%,notes.ilike.%samsung%,client_id.in.(c1,c2)")
  const orCalls = findCalls(mock.log, "projects", "or");
  assert.equal(orCalls.length, 1);
  const orArg = orCalls[0].args[0] as string;
  assert.ok(orArg.includes("title.ilike.%samsung%"), `or contains title clause: ${orArg}`);
  assert.ok(orArg.includes("notes.ilike.%samsung%"), `or contains notes clause: ${orArg}`);
  assert.ok(orArg.includes("client_id.in.(c1,c2)"), `or contains client_id.in clause: ${orArg}`);
});

test("fetchProjectList: q 있음 + clients 매칭 0 → client_id.in 절은 생략", async () => {
  const mock = makeMockSupabase({ clientsResult: { data: [] } });
  await fetchProjectList(mock, { ...baseQuery, q: "no-match" });
  const orCalls = findCalls(mock.log, "projects", "or");
  assert.equal(orCalls.length, 1);
  const orArg = orCalls[0].args[0] as string;
  assert.ok(orArg.includes("title.ilike.%no-match%"));
  assert.ok(orArg.includes("notes.ilike.%no-match%"));
  assert.ok(!orArg.includes("client_id.in"), `client_id.in 절이 없어야 함: ${orArg}`);
});

test("fetchProjectList: q 메타문자 escape → ilike 패턴에 backslash 적용", async () => {
  const mock = makeMockSupabase({ clientsResult: { data: [] } });
  await fetchProjectList(mock, { ...baseQuery, q: "50%_off" });
  const clientIlike = findCalls(mock.log, "clients", "ilike")[0];
  assert.equal(clientIlike.args[1], "%50\\%\\_off%");

  const orArg = findCalls(mock.log, "projects", "or")[0].args[0] as string;
  assert.ok(orArg.includes("title.ilike.%50\\%\\_off%"), orArg);
  assert.ok(orArg.includes("notes.ilike.%50\\%\\_off%"), orArg);
});

test("fetchProjectList: q 150자 → 100자 절단 후 패턴 생성", async () => {
  const mock = makeMockSupabase({ clientsResult: { data: [] } });
  const long = "z".repeat(150);
  await fetchProjectList(mock, { ...baseQuery, q: long });
  const expectedPattern = `%${"z".repeat(100)}%`;
  const clientIlike = findCalls(mock.log, "clients", "ilike")[0];
  assert.equal(clientIlike.args[1], expectedPattern);
});

test("fetchProjectList: q + status 필터 AND 결합", async () => {
  const mock = makeMockSupabase({ clientsResult: { data: [] } });
  await fetchProjectList(mock, {
    ...baseQuery,
    q: "abc",
    status: ["in_progress", "proposal"],
  });
  const orCalls = findCalls(mock.log, "projects", "or");
  const inCalls = findCalls(mock.log, "projects", "in").filter(
    (c) => c.args[0] === "status",
  );
  // 둘 다 호출 (AND 결합 — supabase 체인은 순서대로 AND).
  assert.equal(orCalls.length, 1);
  assert.equal(inCalls.length, 1);
  assert.deepEqual(inCalls[0].args[1], ["in_progress", "proposal"]);
});

test("fetchProjectList: q 없음 + status 만 → 기존 동작 유지", async () => {
  const mock = makeMockSupabase();
  await fetchProjectList(mock, { ...baseQuery, status: ["task_done"] });
  assert.equal(findCalls(mock.log, "projects", "or").length, 0);
  const inCalls = findCalls(mock.log, "projects", "in").filter(
    (c) => c.args[0] === "status",
  );
  assert.equal(inCalls.length, 1);
});

test("fetchProjectList: 페이지네이션 range 호출 검증", async () => {
  const mock = makeMockSupabase();
  await fetchProjectList(mock, { ...baseQuery, page: 3, pageSize: 20 });
  const rangeCalls = findCalls(mock.log, "projects", "range");
  assert.equal(rangeCalls.length, 1);
  // page=3, pageSize=20 → from=40, to=59
  assert.deepEqual(rangeCalls[0].args, [40, 59]);
});
