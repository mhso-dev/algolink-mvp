import { test, expect } from "@playwright/test";

/**
 * SPEC-DASHBOARD-001 — 운영자 대시보드 회귀 테스트.
 *
 * 대상 페르소나: operator
 * 검증 범위:
 *  - KPI 4종 카드 (의뢰 건수 / 배정확정 건수 / 교육중 건수 / 미정산 합계)
 *  - 칸반 5개 컬럼 (의뢰 / 강사매칭 / 컨펌 / 진행 / 정산)
 *  - 캘린더 진입 링크
 *  - 기본 a11y: main role, KPI region aria-label
 */
test.describe("@operator Dashboard", () => {
  test("KPI 4종 카드 표시", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // KPI region — KpiGrid의 aria-label="대시보드 KPI 요약".
    const kpiRegion = page.getByRole("region", { name: "대시보드 KPI 요약" });
    await expect(kpiRegion).toBeVisible();

    // 4종 라벨이 모두 보여야 함. (sr-only 텍스트와 시각 라벨 양쪽에 등장하므로 .first())
    await expect(kpiRegion.getByText("의뢰 건수").first()).toBeVisible();
    await expect(kpiRegion.getByText("배정확정 건수").first()).toBeVisible();
    await expect(kpiRegion.getByText("교육중 건수").first()).toBeVisible();
    await expect(kpiRegion.getByText("미정산 합계").first()).toBeVisible();
  });

  test("칸반 5개 컬럼 헤더", async ({ page }) => {
    await page.goto("/dashboard");

    // 5개 컬럼 라벨이 main 본문에 모두 보여야 함.
    const main = page.getByRole("main");
    for (const label of ["의뢰", "강사매칭", "컨펌", "진행", "정산"]) {
      await expect(main.getByText(label).first()).toBeVisible();
    }
  });

  test("캘린더 진입 링크 동작", async ({ page }) => {
    await page.goto("/dashboard");
    const calendarLink = page.getByRole("link", { name: /강사 일정 보기/ });
    await expect(calendarLink).toBeVisible();
    await calendarLink.click();
    await expect(page).toHaveURL(/\/dashboard\/calendar/);
  });

  test("페이지 헤딩 + main role 존재 (a11y 기본)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /대시보드/ })).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
  });
});
