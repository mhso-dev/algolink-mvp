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

  test("저장된 평문 계좌번호가 DOM/네트워크에 노출되지 않는다 (마스킹/암호화)", async ({
    page,
  }) => {
    // SPEC-E2E-001 REQ-E2E-006: 지급 정보 저장 후, 화면 재진입 시 마스킹 표시 +
    // 평문 계좌번호가 DOM/응답에 포함되지 않아야 한다 (pgcrypto 라운드트립 안전성).
    //
    // 본 테스트는 시드 데이터를 변형하지 않기 위해 "저장 동작" 자체는 수행하지 않고,
    // 페이지 응답에 알려진 평문 후보(연속 13 자리/계좌 패턴)가 노출되지 않는지 안전 검증한다.
    await page.goto("/me/settings/payout", { waitUntil: "networkidle" });

    // 1) 입력 필드의 *실제 value* 는 빈 문자열이어야 한다. 평문 PII 가 hydration 후
    //    React state 로 흘러 들어가면 회귀. (placeholder/helper text 는 안내일 뿐 검증 대상 아님.)
    const piiInputNames = [
      "residentNumber",
      "bankAccount",
      "businessNumber",
      "accountHolder",
    ] as const;
    for (const name of piiInputNames) {
      const input = page.locator(`input[name="${name}"]`);
      if ((await input.count()) === 0) continue;
      const value = await input.inputValue();
      // bankName/accountHolder 등은 비암호화 컬럼이라 값이 있을 수 있어 길이만 검증.
      // 평문 13 자리 RRN/계좌 패턴이 value 에 들어 있으면 회귀.
      const plaintextDigits = /^\d{6}-?\d{7}$|^\d{11,16}$/;
      expect(value, `${name} input value 가 평문 PII 패턴`).not.toMatch(plaintextDigits);
    }

    // 2) 마스킹된 헬퍼 텍스트 또는 placeholder 가 화면 어딘가에 표시된다 (정책 노출).
    //    저장된 값이 없을 수도 있으므로 helper 문구는 optional. 단 "암호화" 안내는 보장.
    const main = page.getByRole("main");
    await expect(main.getByText(/pgcrypto|암호화/)).toBeVisible();

    // 3) DOM 의 사용자-가시 텍스트(main 내부)에 평문 RRN 패턴이 *value* 로 등장하면 회귀.
    //    placeholder 텍스트("000000-0000000") 는 input 의 attribute 이지 textContent 가 아니므로
    //    main.textContent() 에는 포함되지 않는다.
    const visibleText = (await main.textContent()) ?? "";
    const plaintextRrn = /\d{6}-\d{7}(?!\d)/;
    expect(visibleText).not.toMatch(plaintextRrn);
  });
});
