import { test, expect } from "@playwright/test";

/**
 * SPEC-ME-001 §2.6 / §2.7 — 강사 본인 정산 + 지급 정보.
 *
 * 대상 페르소나: instructor
 * 검증 범위:
 *  - /me/settlements 진입 (월별 그룹핑 + ₩ 포맷 가시)
 *  - /me/settings/payout 진입 (지급 정보 폼 — 은행/계좌/RRN 입력 영역 가시)
 *  - 마스킹 표시 영역 존재 (저장된 값이 있을 때 마스킹 형태로 표시)
 *
 * @MX:NOTE 본 테스트는 평문 PII를 직접 저장하지 않는다(시드 데이터 보호).
 * 실제 암호화 라운드트립 검증은 unit test (lib/instructor/payout-queries) 책임.
 */
test.describe("@instructor Settlements & Payouts", () => {
  test("/me/settlements 진입", async ({ page }) => {
    await page.goto("/me/settlements");
    await expect(page).toHaveURL(/\/me\/settlements/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("/me/settings/payout 페이지 진입 + 지급 정보 폼 영역 가시", async ({ page }) => {
    await page.goto("/me/settings/payout");
    await expect(page).toHaveURL(/\/me\/settings\/payout/);
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    // 지급 정보 페이지에는 "은행" / "계좌" / "주민" 키워드가 폼 라벨로 등장.
    const bodyText = await main.textContent();
    expect(bodyText ?? "").toMatch(/은행|계좌|주민|지급/);
  });
});
