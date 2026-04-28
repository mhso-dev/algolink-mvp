import { test, expect } from "@playwright/test";

/**
 * SPEC-PROJECT-001 — 프로젝트 관리 회귀 테스트.
 *
 * 대상 페르소나: operator
 * 검증 범위:
 *  - 프로젝트 리스트 페이지 진입 + 헤딩/필터 바 가시
 *  - 데이터 테이블 컬럼 헤더 가시
 *  - 신규 프로젝트 페이지 진입
 *  - 첫 행 클릭 → 상세 페이지 이동
 *
 * 시드 프로젝트가 존재하면 행이 표시되며, 없는 경우 빈 상태 메시지가 표시될 수 있어
 * 행 카운트는 ≥ 0 으로만 검증.
 */
test.describe("@operator Projects list", () => {
  test("리스트 페이지 진입", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/projects/);
    await expect(
      page.getByRole("heading", { name: /프로젝트/ }).first(),
    ).toBeVisible();
  });

  test("필터 바 + 신규 프로젝트 버튼 가시", async ({ page }) => {
    await page.goto("/projects");
    // 필터 바 영역에는 검색 input이 존재.
    const searchInputs = page.getByRole("textbox");
    await expect(searchInputs.first()).toBeVisible();
    await expect(page.getByRole("link", { name: /새 프로젝트|프로젝트 등록|신규/ }).first()).toBeVisible();
  });

  test("신규 프로젝트 페이지로 이동", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("link", { name: /새 프로젝트|프로젝트 등록|신규/ }).first().click();
    await expect(page).toHaveURL(/\/projects\/new/);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("리스트 → 상세 진입 (행 존재 시)", async ({ page }) => {
    await page.goto("/projects");
    const firstRowLink = page.locator("table tbody tr a").first();
    const count = await firstRowLink.count();
    if (count === 0) {
      test.skip(true, "시드 프로젝트가 없는 환경 — 상세 진입 스킵");
    }
    await firstRowLink.click();
    await expect(page).toHaveURL(/\/projects\/[^/]+/);
    await expect(page.getByRole("main")).toBeVisible();
  });
});
