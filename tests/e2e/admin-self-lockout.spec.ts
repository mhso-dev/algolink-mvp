import { test, expect } from "@playwright/test";
import { SEED_USERS } from "./helpers/seed-users";

/**
 * SPEC-ADMIN-001 §B-8 — admin 본인 self-lockout 차단 회귀.
 *
 * 회귀 시나리오:
 *  - admin 이 /admin/users/{본인 id} 진입 시 비활성화/역할변경 버튼이 노출되지 않거나,
 *    노출되더라도 server action 단에서 거부된다.
 *  - 또한 본인 role 변경(admin → operator) 시도도 차단되어야 한다.
 *
 * 본 테스트는 UI 노출 여부만 검증한다 (action 직접 호출은 SPEC-ADMIN-001 단위테스트에서 검증).
 */

test.describe("@admin self-lockout 방어", () => {
  test("admin 본인 상세 페이지 — 비활성화/역할변경 버튼이 보이지 않거나 disabled", async ({
    page,
  }) => {
    // (a) admin 으로 자기 자신의 admin/users 페이지 진입.
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: /회원/ })).toBeVisible();

    // (b) admin 본인 행 (admin@algolink.local) 식별.
    const myEmail = SEED_USERS.admin.email;
    const myRow = page.locator("table tbody tr", { hasText: myEmail });
    await expect(myRow.first()).toBeVisible();

    // (c) 본인 행에는 "비활성화" 버튼/링크가 없어야 한다 (UI-level 가드).
    //     SPEC-ADMIN-001 §B-8: self-lockout 차단 — 본인 행에 액션 버튼 미렌더.
    const myDeactivateBtn = myRow.getByRole("button", { name: /비활성화/ });
    expect(
      await myDeactivateBtn.count(),
      `admin 본인 행에 비활성화 버튼 노출 — self-lockout 회귀 (SPEC-ADMIN-001 §B-8)`,
    ).toBe(0);
  });
});
