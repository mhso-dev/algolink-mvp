// SPEC-ME-001 §2.7 M7 — pgcrypto encrypt/decrypt RPC wrapper 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptPayoutField, decryptPayoutField } from "../pii-encrypt";

type RpcCall = { fn: string; args: Record<string, unknown> };

interface MockResponse {
  data?: unknown;
  error?: { message: string } | null;
}

function makeMockSupabase(responder: (call: RpcCall) => MockResponse) {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc(fn: string, args: Record<string, unknown>) {
        const call = { fn, args };
        calls.push(call);
        const r = responder(call);
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

// ---------- encryptPayoutField ----------

test("encryptPayoutField: 평문을 RPC encrypt_payout_field 로 위임 + key_label='default' 자동 주입", async () => {
  const { client, calls } = makeMockSupabase(() => ({
    data: "\\xdeadbeef",
  }));
  const out = await encryptPayoutField(client, "900101-1234567");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.fn, "encrypt_payout_field");
  assert.equal(calls[0]!.args.plaintext, "900101-1234567");
  assert.equal(calls[0]!.args.key_label, "default");
  assert.ok(out instanceof Uint8Array);
  assert.equal(out!.length, 4);
  assert.equal(out![0], 0xde);
  assert.equal(out![3], 0xef);
});

test("encryptPayoutField: 빈 문자열 → RPC 호출 없이 null", async () => {
  const { client, calls } = makeMockSupabase(() => ({ data: null }));
  const out = await encryptPayoutField(client, "");
  assert.equal(out, null);
  assert.equal(calls.length, 0);
});

test("encryptPayoutField: null/undefined 입력 → null 반환 (no-op)", async () => {
  const { client, calls } = makeMockSupabase(() => ({ data: null }));
  assert.equal(await encryptPayoutField(client, null), null);
  assert.equal(await encryptPayoutField(client, undefined), null);
  assert.equal(calls.length, 0);
});

test("encryptPayoutField: base64 응답도 Uint8Array 로 변환", async () => {
  const { client } = makeMockSupabase(() => ({ data: Buffer.from([1, 2, 3, 4]).toString("base64") }));
  const out = await encryptPayoutField(client, "test");
  assert.ok(out instanceof Uint8Array);
  assert.deepEqual(Array.from(out!), [1, 2, 3, 4]);
});

test("encryptPayoutField: pgcrypto 미설치 RPC 에러 → 한국어 메시지", async () => {
  const { client } = makeMockSupabase(() => ({
    error: { message: 'function pgp_sym_encrypt(text, text) does not exist' },
  }));
  await assert.rejects(
    () => encryptPayoutField(client, "test"),
    /pgcrypto 확장이 설치되어 있지 않습니다/,
  );
});

test("encryptPayoutField: RPC 미배포 → 한국어 안내", async () => {
  const { client } = makeMockSupabase(() => ({
    error: { message: 'function app.encrypt_payout_field(text, text) does not exist' },
  }));
  await assert.rejects(
    () => encryptPayoutField(client, "test"),
    /supabase migration을 적용해주세요/,
  );
});

test("encryptPayoutField: pii_encryption_key 미설정 → 친숙한 안내", async () => {
  const { client } = makeMockSupabase(() => ({
    error: { message: 'unrecognized configuration parameter "app.pii_encryption_key"' },
  }));
  await assert.rejects(
    () => encryptPayoutField(client, "test"),
    /서버 암호화 키가 설정되어 있지 않습니다/,
  );
});

// ---------- decryptPayoutField ----------

test("decryptPayoutField: Uint8Array → hex 문자열 RPC 파라미터로 변환", async () => {
  const { client, calls } = makeMockSupabase(() => ({ data: "900101-1234567" }));
  const out = await decryptPayoutField(
    client,
    new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
    "11111111-1111-1111-1111-111111111111",
  );
  assert.equal(out, "900101-1234567");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.fn, "decrypt_payout_field");
  assert.equal(calls[0]!.args.ciphertext, "\\xdeadbeef");
  assert.equal(calls[0]!.args.owner_instructor_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(calls[0]!.args.key_label, "default");
});

test("decryptPayoutField: hex 문자열 입력 그대로 전달", async () => {
  const { client, calls } = makeMockSupabase(() => ({ data: "111-22-33333" }));
  await decryptPayoutField(client, "\\xc0ffee", "11111111-1111-1111-1111-111111111111");
  assert.equal(calls[0]!.args.ciphertext, "\\xc0ffee");
});

test("decryptPayoutField: null/빈 입력 → RPC 호출 없이 null", async () => {
  const { client, calls } = makeMockSupabase(() => ({ data: null }));
  assert.equal(await decryptPayoutField(client, null, "i"), null);
  assert.equal(await decryptPayoutField(client, undefined, "i"), null);
  assert.equal(await decryptPayoutField(client, "", "i"), null);
  assert.equal(await decryptPayoutField(client, new Uint8Array(0), "i"), null);
  assert.equal(calls.length, 0);
});

test("decryptPayoutField: 권한 거부 (다른 instructor row) → 한국어 메시지", async () => {
  const { client } = makeMockSupabase(() => ({
    error: { message: 'permission denied: payout decrypt restricted to row owner' },
  }));
  await assert.rejects(
    () => decryptPayoutField(client, new Uint8Array([1, 2, 3]), "other-id"),
    /본인 row만 복호화할 수 있습니다/,
  );
});

test("decryptPayoutField: 미인증 caller → 세션 만료 안내", async () => {
  const { client } = makeMockSupabase(() => ({
    error: { message: 'authentication required' },
  }));
  await assert.rejects(
    () => decryptPayoutField(client, new Uint8Array([1]), "id"),
    /세션이 만료되었습니다/,
  );
});

test("decryptPayoutField: 결과 string 아님 → 형식 오류", async () => {
  const { client } = makeMockSupabase(() => ({ data: 12345 }));
  await assert.rejects(
    () => decryptPayoutField(client, new Uint8Array([1]), "id"),
    /형식 오류/,
  );
});
