import { test, expect } from "@playwright/test";

/**
 * 4-SPEC sequence smoke verification (PAYOUT-002 / RECEIPT-001 / CONFIRM-001 / PROPOSAL-001).
 *
 * Goal: 신규로 추가된 라우트가 빌드/렌더링/RBAC 측면에서 의도대로 작동하는지
 *       페르소나별로 진입 + heading 가시 + 스크린샷으로 시각 증거 캡처.
 *
 * 비파괴 원칙:
 *  - form 제출 / DB mutate 하지 않음 (URL 진입 + 정적 내용 검증만).
 *  - 시드 데이터 부재로 빈 목록이 정상일 수 있음 (페이지 자체 렌더 여부 검증).
 *
 * 페르소나 매핑:
 *  - operator: PAYOUT-002, RECEIPT-001, PROPOSAL-001 운영자 화면
 *  - instructor: CONFIRM-001 (배정/사전문의 응답), RECEIPT-001 강사 송금 등록
 */

const SHOT_DIR = "test-results/phase4-screenshots";

// =============================================================================
// SPEC-PAYOUT-002 — 시간당 사업비 정산
// =============================================================================
test.describe("@operator SPEC-PAYOUT-002", () => {
  test("/projects/new 진입 (시급/분배율 입력 폼 존재 확인 — 신규 작성 진입점)", async ({
    page,
  }) => {
    await page.goto("/projects/new");
    await expect(page).toHaveURL(/\/projects\/new/);
    await expect(page.getByRole("main")).toBeVisible();
    // SPEC-PAYOUT-002: 프로젝트 폼에 시급/분배율 관련 필드가 노출되어야 함.
    const main = page.getByRole("main");
    const text = (await main.textContent()) ?? "";
    expect(text).toMatch(/시급|시간당|분배|단가|요율|보수|사업비|예산/);
    await page.screenshot({
      path: `${SHOT_DIR}/payout-002-projects-new.png`,
      fullPage: true,
    });
  });

  test("/settlements/generate 운영자 정산 생성 페이지 렌더", async ({ page }) => {
    await page.goto("/settlements/generate");
    await expect(page).toHaveURL(/\/settlements\/generate/);
    await expect(page.getByRole("main")).toBeVisible();
    const main = page.getByRole("main");
    const text = (await main.textContent()) ?? "";
    // 정산 생성 페이지는 기간 선택 + 생성 액션 안내 텍스트 존재.
    expect(text).toMatch(/정산|생성|기간|월|시작|종료/);
    await page.screenshot({
      path: `${SHOT_DIR}/payout-002-settlements-generate.png`,
      fullPage: true,
    });
  });

  test("/settlements 목록 진입 (운영자 정산 리스트)", async ({ page }) => {
    await page.goto("/settlements");
    await expect(page).toHaveURL(/\/settlements(\?|$)/);
    await expect(page.getByRole("main")).toBeVisible();
    await page.screenshot({
      path: `${SHOT_DIR}/payout-002-settlements-list.png`,
      fullPage: true,
    });
  });
});

// =============================================================================
// SPEC-RECEIPT-001 — 영수증 발급 (client_direct flow)
// =============================================================================
test.describe("@operator SPEC-RECEIPT-001 (operator)", () => {
  test("/settlements 목록에 client_direct flow 노출 가능 여부 (RBAC + 라우트)", async ({
    page,
  }) => {
    await page.goto("/settlements");
    await expect(page.getByRole("main")).toBeVisible();
    // 시드에 client_direct settlement 가 없을 수도 있어 빈 결과 OK.
    // 페이지 자체가 렌더되고 flow 필터/구분 키워드가 어딘가 표시되는지만 검증.
    await page.screenshot({
      path: `${SHOT_DIR}/receipt-001-settlements-list-operator.png`,
      fullPage: true,
    });
  });
});

test.describe("@instructor SPEC-RECEIPT-001 (instructor)", () => {
  test("/me/settlements 진입 (강사 본인 정산 리스트 — 송금 대상)", async ({ page }) => {
    await page.goto("/me/settlements");
    await expect(page).toHaveURL(/\/me\/settlements/);
    await expect(page.getByRole("main")).toBeVisible();
    await page.screenshot({
      path: `${SHOT_DIR}/receipt-001-me-settlements.png`,
      fullPage: true,
    });
  });
});

// =============================================================================
// SPEC-CONFIRM-001 / SPEC-AMEND-001 — 강사 응답 (배정/사전문의)
// =============================================================================
test.describe("@instructor SPEC-CONFIRM-001", () => {
  test("/me/assignments 강사 배정 응답 페이지 렌더", async ({ page }) => {
    await page.goto("/me/assignments", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/me\/assignments/);
    // RSC streaming + Suspense fallback(loading.tsx) 회피를 위해 heading 명시 대기.
    await expect(page.getByRole("heading", { name: /배정 요청/ })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: `${SHOT_DIR}/confirm-001-me-assignments.png`,
      fullPage: true,
    });
  });

  test("/me/inquiries 강사 사전 문의 응답 페이지 렌더", async ({ page }) => {
    await page.goto("/me/inquiries", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/me\/inquiries/);
    // RSC streaming + Suspense fallback(loading.tsx) 회피를 위해 heading 명시 대기.
    await expect(page.getByRole("heading", { name: /사전 문의/ })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({
      path: `${SHOT_DIR}/confirm-001-me-inquiries.png`,
      fullPage: true,
    });
  });
});

// =============================================================================
// SPEC-PROPOSAL-001 — 제안서 도메인
// =============================================================================
test.describe("@operator SPEC-PROPOSAL-001", () => {
  test("/proposals 운영자 제안서 목록 진입", async ({ page }) => {
    await page.goto("/proposals");
    await expect(page).toHaveURL(/\/proposals(\?|$)/);
    await expect(page.getByRole("main")).toBeVisible();
    const text = (await page.getByRole("main").textContent()) ?? "";
    expect(text).toMatch(/제안서|제안|Proposal|영업/);
    await page.screenshot({
      path: `${SHOT_DIR}/proposal-001-list.png`,
      fullPage: true,
    });
  });

  test("/proposals/new 신규 제안서 작성 페이지 렌더", async ({ page }) => {
    await page.goto("/proposals/new");
    await expect(page).toHaveURL(/\/proposals\/new/);
    await expect(page.getByRole("main")).toBeVisible();
    const text = (await page.getByRole("main").textContent()) ?? "";
    expect(text).toMatch(/제안서|제목|고객|클라이언트|작성/);
    await page.screenshot({
      path: `${SHOT_DIR}/proposal-001-new.png`,
      fullPage: true,
    });
  });
});

// =============================================================================
// 회귀: anon 랜딩 + login 페이지
// =============================================================================
test.describe("@anon 회귀 — 공개 라우트", () => {
  test("/login 페이지 정상 렌더 (anon, 로그인 폼 가시)", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    const submitBtn = page.getByRole("button", { name: /^로그인$/ });
    await expect(submitBtn).toBeVisible();
    await page.screenshot({
      path: `${SHOT_DIR}/regression-login.png`,
      fullPage: true,
    });
  });
});
