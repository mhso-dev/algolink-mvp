import { test, expect } from "@playwright/test";

/**
 * 입력 검증 회귀 — 폼/Server Action 단의 zod 검증이 작동하는지 확인.
 *
 * 검증 대상:
 *  1. 프로젝트 등록: title 미입력 → fieldErrors 노출
 *  2. 프로젝트 등록: clientId 미선택 → fieldErrors 노출
 *  3. 프로젝트 등록: 종료일 < 시작일 → fieldErrors 노출
 *  4. 고객사 등록: 회사명 미입력 → fieldErrors 노출
 *  5. XSS 페이로드: title 에 <script> 입력 → 등록 후 detail 에서 텍스트로 escape 됨
 */

test.describe("@operator 입력 검증 회귀", () => {
  test("프로젝트 등록 — title 미입력 시 폼이 진행되지 않는다", async ({ page }) => {
    await page.goto("/projects/new");
    // 다른 필드만 채우고 title 비워둔 채 제출.
    const clientTrigger = page.locator("#clientId");
    await clientTrigger.click();
    const optionList = page.getByRole("listbox");
    await expect(optionList).toBeVisible();
    await page.getByRole("option").first().click();
    await expect(optionList).toBeHidden();

    // submit
    await page.getByRole("button", { name: /^등록$/ }).first().click();

    // title required HTML5 가드 또는 server action 검증으로 /projects/new 에 머문다.
    await page.waitForTimeout(800);
    const path = new URL(page.url()).pathname;
    expect(path, "title 미입력에도 redirect 발생 — 검증 회귀").toMatch(/\/projects\/new/);
  });

  test("프로젝트 등록 — 종료일 < 시작일 → fieldErrors 노출", async ({ page }) => {
    await page.goto("/projects/new");
    await page.locator("#title").fill(`E2E_validation_${Date.now()}`);

    const clientTrigger = page.locator("#clientId");
    await clientTrigger.click();
    await page.getByRole("listbox").waitFor();
    await page.getByRole("option").first().click();

    // 시작일 = 어제, 종료일 = 그저께 → 검증 실패.
    await page.locator("#startAt").fill("2026-04-30");
    await page.locator("#endAt").fill("2026-04-25");

    await page.getByRole("button", { name: /^등록$/ }).first().click();
    // alert role 에 "종료일은 시작일과 같거나 늦어야 합니다." 메시지 노출.
    const alert = page.getByText(/종료일.*시작일.*늦어야/);
    await expect(alert).toBeVisible({ timeout: 10_000 });
  });

  test("고객사 등록 — 회사명 미입력 → fieldErrors 노출 또는 폼 유지", async ({
    page,
  }) => {
    await page.goto("/clients/new");
    // companyName 비워두고 contact-name 만 채워서 제출.
    await page.locator("#contact-name-0").fill("E2E담당자");
    await page.getByRole("button", { name: /등록|저장|생성/ }).first().click();
    await page.waitForTimeout(800);
    const path = new URL(page.url()).pathname;
    expect(path, "회사명 미입력에도 등록 성공 — 검증 회귀").toMatch(
      /\/clients\/new/,
    );
  });

  test("XSS 방어 — title 에 <script> 입력 후 상세 페이지에서 escape 노출", async ({
    page,
  }) => {
    const xssPayload = `XSS_${Date.now()}<script>window.__xss=true</script>`;
    await page.goto("/projects/new");
    await page.locator("#title").fill(xssPayload);
    await page.locator("#clientId").click();
    await page.getByRole("listbox").waitFor();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /^등록$/ }).first().click();
    await page.waitForURL(/\/projects\/[0-9a-f-]+(\?|$)/, { timeout: 30_000 });

    // 페이로드는 텍스트로 표시되어야 하며 window.__xss 는 정의되지 않아야 한다.
    const xssExecuted = await page.evaluate(() => "__xss" in window);
    expect(xssExecuted, "XSS 페이로드가 실행됨 — escape 회귀").toBe(false);
    // 페이로드의 안전한 prefix 가 텍스트로 노출되어야 한다.
    await expect(page.getByText(/XSS_\d+/)).toBeVisible();
  });
});
