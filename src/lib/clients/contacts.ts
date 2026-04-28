// SPEC-CLIENT-001 §2.4 REQ-CLIENT001-UPDATE-CONTACTS — 담당자 N명 diff 계산.
// @MX:NOTE: 순수 함수. 기존 contacts vs 입력 contacts → add/remove/reorder로 분류.

import type { ContactInput } from "./types";

export interface ExistingContact {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  sortOrder: string | null;
}

export interface ContactsDiff {
  /** 신규 INSERT (id 없음) */
  toAdd: Array<ContactInput & { sortOrder: string }>;
  /** DELETE할 기존 row id */
  toRemove: string[];
  /** sort_order 또는 필드 변경 — UPDATE */
  toUpdate: Array<{
    id: string;
    name: string;
    position: string | null;
    email: string | null;
    phone: string | null;
    sortOrder: string;
  }>;
}

/**
 * existing 담당자 vs incoming 담당자 입력을 비교하여 add/remove/update를 산출.
 * 입력 순서가 sort_order ('0', '1', '2', ...)가 된다.
 *
 * - id 있음 + existing에 매칭 → toUpdate (변경 여부 무관, sort_order 재할당)
 * - id 없음 → toAdd
 * - existing에 있지만 incoming에 없는 id → toRemove
 */
export function diffContacts(
  existing: ExistingContact[],
  incoming: ContactInput[],
): ContactsDiff {
  const incomingIds = new Set(
    incoming
      .map((c) => c.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );

  const existingMap = new Map(existing.map((e) => [e.id, e]));

  const toAdd: ContactsDiff["toAdd"] = [];
  const toUpdate: ContactsDiff["toUpdate"] = [];
  const toRemove: string[] = [];

  for (const e of existing) {
    if (!incomingIds.has(e.id)) {
      toRemove.push(e.id);
    }
  }

  incoming.forEach((c, index) => {
    const sortOrder = String(index);
    if (c.id && existingMap.has(c.id)) {
      toUpdate.push({
        id: c.id,
        name: c.name,
        position: c.position ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        sortOrder,
      });
    } else {
      toAdd.push({
        name: c.name,
        position: c.position ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        sortOrder,
      });
    }
  });

  return { toAdd, toRemove, toUpdate };
}
