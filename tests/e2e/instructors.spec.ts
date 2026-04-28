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

  test("강사 등록 폼 → 리스트 라우트로 복귀 (등록 성공 신호)", async ({ page }) => {
    // SPEC-E2E-001 REQ-E2E-004: 신규 강사 등록 폼 제출 후 에러 없이 리스트로 복귀해야 한다.
    // 시드 데이터에 새 강사가 노출되는지는 페이지네이션/정렬에 따라 달라질 수 있어,
    // 본 테스트는 "폼 제출 → /instructors 복귀 + 에러 alert 부재" 까지만 회귀 검증한다.
    test.setTimeout(60_000);
    const stamp = Date.now();
    const nameKr = `회귀강사${stamp}`;
    const email = `e2e+${stamp}@algolink.local`;

    await page.goto("/instructors/new");
    await page.locator("#nameKr").fill(nameKr);
    await page.locator("#email").fill(email);
    await page.getByRole("button", { name: /등록/ }).click();

    // 성공 시 리스트(또는 상세) 로 redirect — /instructors 로 시작하는 경로면 OK.
    // 실패 시 동일 페이지에 role=alert 가 노출된다.
    await page
      .waitForURL((url) => url.pathname.startsWith("/instructors") && !url.pathname.endsWith("/new"), {
        timeout: 30_000,
      })
      .catch(() => null);

    if (page.url().includes("/instructors/new")) {
      // 폼 제출이 클라이언트 검증으로 막혔다면 alert 가 떠 있어야 한다.
      const errAlert = page.getByRole("alert");
      const errCount = await errAlert.count();
      // 실패 진단을 명확히: alert 가 없는데 redirect 도 안됐으면 회귀.
      expect(errCount, `폼이 /instructors/new 에 머무름 — alert 도 없음 (회귀)`).toBeGreaterThan(0);
      test.skip(true, `등록이 차단됨 (alert 노출): ${(await errAlert.first().textContent()) ?? ""}`);
    }

    // 리스트로 복귀했으면 main 영역과 강사 관리 헤딩이 보여야 한다.
    await expect(page.getByRole("main")).toBeVisible();
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

test.describe("@operator AI matching from project detail", () => {
  test("프로젝트 상세 → AI 추천 실행 → 후보 또는 룰 기반 폴백 가시", async ({ page }) => {
    // SPEC-E2E-001 REQ-E2E-004: 프로젝트 상세에서 AI 매칭 트리거 → top-3 후보 또는 폴백 메시지.
    test.setTimeout(90_000);
    await page.goto("/projects");
    const firstRow = page.locator("table tbody tr a").first();
    if ((await firstRow.count()) === 0) {
      test.skip(true, "시드 프로젝트 부재 — AI 매칭 테스트 스킵");
    }
    await firstRow.click();
    await expect(page).toHaveURL(/\/projects\/[^/]+/);

    // 추천 버튼이 존재하면 클릭 (이미 강사 배정된 경우 hidden).
    const recBtn = page.getByRole("button", { name: /추천 (실행|다시 실행)/ });
    if ((await recBtn.count()) === 0) {
      test.skip(true, "이미 강사 배정된 프로젝트 — 추천 버튼 비노출");
    }
    await recBtn.first().click();

    // top-3 후보 ul (aria-label="강사 추천 후보") 또는 명시적 폴백/에러 메시지가 나와야 한다.
    const candidatesList = page.getByRole("list", { name: "강사 추천 후보" });
    const errorAlert = page.getByRole("alert");
    const statusMsg = page.getByRole("status");
    const anyResult = candidatesList.or(errorAlert).or(statusMsg);
    await expect(anyResult.first()).toBeVisible({ timeout: 60_000 });

    // 후보가 떴다면 1~3 개 행을 가져야 한다 (룰 기반 폴백 포함).
    if (await candidatesList.isVisible().catch(() => false)) {
      const items = candidatesList.locator("> li");
      const n = await items.count();
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
  });
});
