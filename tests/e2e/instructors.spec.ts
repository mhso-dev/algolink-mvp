import { test, expect } from "@playwright/test";

/**
 * SPEC-INSTRUCTOR-001 — 강사 관리 회귀 테스트.
 *
 * 대상 페르소나: operator
 * 검증 범위:
 *  - 강사 리스트 페이지 진입 + 데이터 행 ≥ 1
 *  - 정렬 가능 헤더(이름/강의 횟수/만족도 평균/마지막 강의일) 가시
 *  - 강사 등록 페이지 진입
 *  - 강사 상세 페이지 진입 + 본문 가시
 *
 * 시드: instructors row 30000000-0000-0000-0000-000000000001 등이 미리 들어 있음.
 * 새 강사 등록은 시드 데이터를 흩뜨리지 않도록 본 테스트에선 페이지 진입까지만 검증.
 */
test.describe("@operator Instructors list", () => {
  test("리스트 페이지 진입 + 헤딩/등록 버튼", async ({ page }) => {
    await page.goto("/instructors");
    await expect(page).toHaveURL(/\/instructors/);
    await expect(page.getByRole("heading", { name: /강사 관리/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /강사 등록/ })).toBeVisible();
  });

  test("데이터 테이블 행 ≥ 1", async ({ page }) => {
    await page.goto("/instructors");
    // shadcn Table → tbody tr 행이 시드 강사 수만큼 보여야 한다.
    const rows = page.locator("table tbody tr");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test("정렬 가능 컬럼 헤더 가시", async ({ page }) => {
    await page.goto("/instructors");
    for (const label of ["이름", "강의 횟수", "만족도 평균", "마지막 강의일"]) {
      await expect(page.getByRole("link", { name: new RegExp(label) }).first()).toBeVisible();
    }
  });

  test("강사 등록 페이지로 이동", async ({ page }) => {
    await page.goto("/instructors");
    await page.getByRole("link", { name: /강사 등록/ }).click();
    await expect(page).toHaveURL(/\/instructors\/new/);
    await expect(page.getByRole("heading", { name: /강사 등록|신규 강사/ })).toBeVisible();
  });

  test("강사 상세 페이지 진입", async ({ page }) => {
    await page.goto("/instructors");
    // 첫 번째 행의 강사 이름 링크를 클릭 → 상세 페이지로 이동.
    const firstRowLink = page.locator("table tbody tr a").first();
    await expect(firstRowLink).toBeVisible();
    await firstRowLink.click();
    await expect(page).toHaveURL(/\/instructors\/[^/]+/);
    // 상세 페이지에 main role + heading 존재.
    await expect(page.getByRole("main")).toBeVisible();
  });
});
