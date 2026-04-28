// SPEC-CLIENT-001 §2.4 — diffContacts 순수 함수 단위 테스트.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffContacts, type ExistingContact } from "../contacts";

const A: ExistingContact = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "A",
  position: null,
  email: null,
  phone: null,
  sortOrder: "0",
};
const B: ExistingContact = { ...A, id: "22222222-2222-4222-8222-222222222222", name: "B", sortOrder: "1" };
const C: ExistingContact = { ...A, id: "33333333-3333-4333-8333-333333333333", name: "C", sortOrder: "2" };

test("diffContacts: 변경 없음 → toUpdate에 모두 (sort_order 재할당)", () => {
  const diff = diffContacts(
    [A, B, C],
    [
      { id: A.id, name: "A" },
      { id: B.id, name: "B" },
      { id: C.id, name: "C" },
    ],
  );
  assert.equal(diff.toAdd.length, 0);
  assert.equal(diff.toRemove.length, 0);
  assert.equal(diff.toUpdate.length, 3);
  assert.equal(diff.toUpdate[0].sortOrder, "0");
  assert.equal(diff.toUpdate[2].sortOrder, "2");
});

test("diffContacts: D 추가 → toAdd 1건 (sort_order='3')", () => {
  const diff = diffContacts(
    [A, B, C],
    [
      { id: A.id, name: "A" },
      { id: B.id, name: "B" },
      { id: C.id, name: "C" },
      { name: "D" },
    ],
  );
  assert.equal(diff.toAdd.length, 1);
  assert.equal(diff.toAdd[0].name, "D");
  assert.equal(diff.toAdd[0].sortOrder, "3");
  assert.equal(diff.toRemove.length, 0);
});

test("diffContacts: B 삭제 → toRemove 1건, C는 sort_order='1'로 재할당", () => {
  const diff = diffContacts(
    [A, B, C],
    [
      { id: A.id, name: "A" },
      { id: C.id, name: "C" },
    ],
  );
  assert.deepEqual(diff.toRemove, [B.id]);
  const cUpdate = diff.toUpdate.find((u) => u.id === C.id);
  assert.equal(cUpdate?.sortOrder, "1");
});

test("diffContacts: 재정렬 [C,A,B] → 모두 toUpdate, sort_order 변경", () => {
  const diff = diffContacts(
    [A, B, C],
    [
      { id: C.id, name: "C" },
      { id: A.id, name: "A" },
      { id: B.id, name: "B" },
    ],
  );
  assert.equal(diff.toRemove.length, 0);
  assert.equal(diff.toAdd.length, 0);
  const c = diff.toUpdate.find((u) => u.id === C.id);
  const a = diff.toUpdate.find((u) => u.id === A.id);
  const b = diff.toUpdate.find((u) => u.id === B.id);
  assert.equal(c?.sortOrder, "0");
  assert.equal(a?.sortOrder, "1");
  assert.equal(b?.sortOrder, "2");
});

test("diffContacts: A 삭제 + C 추가 + B 위치 0", () => {
  const diff = diffContacts(
    [A, B],
    [
      { id: B.id, name: "B" },
      { name: "C" },
    ],
  );
  assert.deepEqual(diff.toRemove, [A.id]);
  assert.equal(diff.toAdd.length, 1);
  assert.equal(diff.toAdd[0].name, "C");
  assert.equal(diff.toAdd[0].sortOrder, "1");
  const bUpd = diff.toUpdate.find((u) => u.id === B.id);
  assert.equal(bUpd?.sortOrder, "0");
});

test("diffContacts: 빈 existing + 신규 2명", () => {
  const diff = diffContacts(
    [],
    [{ name: "X" }, { name: "Y" }],
  );
  assert.equal(diff.toAdd.length, 2);
  assert.equal(diff.toAdd[0].sortOrder, "0");
  assert.equal(diff.toAdd[1].sortOrder, "1");
  assert.equal(diff.toRemove.length, 0);
});
