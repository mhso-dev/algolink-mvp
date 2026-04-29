// SPEC-RECEIPT-001 §M2 — organization-info 단위 테스트.
// REQ-RECEIPT-PDF-003 — DB 우선 → env fallback → 둘 다 없으면 ORGANIZATION_INFO_MISSING.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getOrganizationInfo } from "../organization-info";

const SAMPLE_DB_ROW = {
  id: 1,
  name: "주식회사 알고링크",
  business_number: "123-45-67890",
  representative: "홍길동",
  address: "서울특별시 강남구 테헤란로 123",
  contact: "02-1234-5678",
  updated_at: "2026-04-29T00:00:00Z",
};

function makeFakeSupabase(rowOrNull: typeof SAMPLE_DB_ROW | null) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: number) => ({
          maybeSingle: async () => ({ data: rowOrNull, error: null }),
        }),
      }),
    }),
  };
}

function makeFakeSupabaseError() {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: number) => ({
          maybeSingle: async () => ({
            data: null,
            error: { message: "db error" },
          }),
        }),
      }),
    }),
  };
}

const SAVE_ENV_KEYS = [
  "ORG_NAME",
  "ORG_BIZ_NUMBER",
  "ORG_REPRESENTATIVE",
  "ORG_ADDRESS",
  "ORG_CONTACT",
] as const;

function clearEnv() {
  for (const k of SAVE_ENV_KEYS) {
    delete process.env[k];
  }
}

function setEnv(values: Partial<Record<(typeof SAVE_ENV_KEYS)[number], string>>) {
  clearEnv();
  for (const [k, v] of Object.entries(values)) {
    if (v !== undefined) process.env[k] = v;
  }
}

// =============================================================================
// DB 우선
// =============================================================================

test("getOrganizationInfo: DB 행 존재 시 DB 데이터 반환", async () => {
  clearEnv();
  const supa = makeFakeSupabase(SAMPLE_DB_ROW);
  const info = await getOrganizationInfo(supa);
  assert.equal(info.name, "주식회사 알고링크");
  assert.equal(info.businessNumber, "123-45-67890");
  assert.equal(info.representative, "홍길동");
  assert.equal(info.address, "서울특별시 강남구 테헤란로 123");
  assert.equal(info.contact, "02-1234-5678");
});

test("getOrganizationInfo: DB 행 + env 동시 존재 시 DB 우선", async () => {
  setEnv({
    ORG_NAME: "ENV-NAME",
    ORG_BIZ_NUMBER: "ENV-BIZ",
    ORG_REPRESENTATIVE: "ENV-REP",
    ORG_ADDRESS: "ENV-ADDR",
    ORG_CONTACT: "ENV-CON",
  });
  const supa = makeFakeSupabase(SAMPLE_DB_ROW);
  const info = await getOrganizationInfo(supa);
  assert.equal(info.name, "주식회사 알고링크"); // DB 값
  assert.notEqual(info.name, "ENV-NAME");
  clearEnv();
});

// =============================================================================
// env fallback
// =============================================================================

test("getOrganizationInfo: DB 없음 + env 모두 설정 → env 데이터 반환", async () => {
  setEnv({
    ORG_NAME: "주식회사 알고링크 (env)",
    ORG_BIZ_NUMBER: "999-99-99999",
    ORG_REPRESENTATIVE: "홍길동 (env)",
    ORG_ADDRESS: "서울 (env)",
    ORG_CONTACT: "010-0000-0000",
  });
  const supa = makeFakeSupabase(null);
  const info = await getOrganizationInfo(supa);
  assert.equal(info.name, "주식회사 알고링크 (env)");
  assert.equal(info.businessNumber, "999-99-99999");
  clearEnv();
});

// =============================================================================
// 둘 다 없으면 에러
// =============================================================================

test("getOrganizationInfo: DB 없음 + env 모두 unset → ORGANIZATION_INFO_MISSING throw", async () => {
  clearEnv();
  const supa = makeFakeSupabase(null);
  await assert.rejects(
    () => getOrganizationInfo(supa),
    /알고링크 사업자 정보가 설정되지 않았습니다/,
  );
});

test("getOrganizationInfo: DB 없음 + env 일부만 설정 → ORGANIZATION_INFO_MISSING throw", async () => {
  setEnv({ ORG_NAME: "test", ORG_BIZ_NUMBER: "123" });
  const supa = makeFakeSupabase(null);
  await assert.rejects(
    () => getOrganizationInfo(supa),
    /알고링크 사업자 정보가 설정되지 않았습니다/,
  );
  clearEnv();
});

test("getOrganizationInfo: DB 행이 빈 필드 보유 시 env fallback (또는 missing)", async () => {
  // DB 행이 NULL/빈 값을 포함한 경우 env로 fallback
  clearEnv();
  const incomplete = { ...SAMPLE_DB_ROW, name: "", business_number: "" };
  const supa = makeFakeSupabase(incomplete);
  await assert.rejects(
    () => getOrganizationInfo(supa),
    /알고링크 사업자 정보가 설정되지 않았습니다/,
  );
});

test("getOrganizationInfo: DB 에러 + env 설정 → env fallback", async () => {
  setEnv({
    ORG_NAME: "fallback",
    ORG_BIZ_NUMBER: "111-22-33333",
    ORG_REPRESENTATIVE: "rep",
    ORG_ADDRESS: "addr",
    ORG_CONTACT: "con",
  });
  const supa = makeFakeSupabaseError();
  const info = await getOrganizationInfo(supa);
  assert.equal(info.name, "fallback");
  clearEnv();
});
