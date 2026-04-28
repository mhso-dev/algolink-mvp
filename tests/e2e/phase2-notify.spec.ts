import { test, expect } from "@playwright/test";
import { PERSONAS } from "./helpers/personas";

/**
 * SPEC-E2E-002 REQ-E2E2-004 — NOTIFY 정산요청 트리거 골든패스 (cross-role).
 *
 * 검증 범위:
 *  1. operator 가 pending 정산을 "정산 요청" 으로 전환 (settlement_requested 알림 발송)
 *  2. 알림 수신자(instructor)에서 NotificationBell unread 카운트 +1
 *  3. instructor 가 dropdown 클릭 → read 처리 → unread 카운트 -1
 *
 * 트리거 수신자:
 *  - SPEC-NOTIFY-001 §F-206 + src/lib/payouts/mail-stub.ts — 정산요청 알림은
 *    instructors.user_id 로 발송된다. 따라서 검증은 강사 페르소나에서 수행한다.
 *
 * cleanup: 정산 상태 원복 + 알림 행 삭제 API 부재 — prefix 격리 불가, best-effort 로그.
 */
test.describe("@operator phase2-notify", () => {
  test("operator 정산 요청 → instructor bell 카운트 +1 → dropdown 클릭 후 -1", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);

    // bell aria-label 패턴: "알림" 또는 "알림, 안읽음 N건".
    async function readUnreadCount(p: typeof page): Promise<number> {
      const btn = p.getByRole("button", { name: /^알림(, 안읽음 \d+건)?$/ });
      if ((await btn.count()) === 0) return 0;
      const label = await btn.first().getAttribute("aria-label");
      if (!label) return 0;
      const m = label.match(/안읽음 (\d+)건/);
      return m ? Number(m[1]) : 0;
    }

    // (1) instructor 컨텍스트로 시작 시점 bell unread 카운트 캡처.
    const instructorContext = await browser.newContext({
      storageState: PERSONAS.instructor.storageStatePath,
    });
    const instructorPage = await instructorContext.newPage();
    await instructorPage.goto("/me");
    const unreadBefore = await readUnreadCount(instructorPage);

    // (2) operator 컨텍스트(현재 page) 로 pending 정산 요청.
    await page.goto("/settlements?status=pending");
    const pendingRows = page.locator("table tbody tr", {
      hasText: /정산\s*전|pending/i,
    });
    if ((await pendingRows.count()) === 0) {
      throw new Error(
        "pending 정산 시드 부재 — phase2 시드 미적용 또는 이전 테스트가 모두 paid 처리.",
      );
    }
    const detailLink = pendingRows.first().locator('a[href*="/settlements/"]').first();
    await expect(detailLink).toBeVisible();
    await detailLink.click();
    await expect(page).toHaveURL(/\/settlements\/[0-9a-f-]+/);

    page.once("dialog", (d) => d.accept());
    const requestBtn = page.getByRole("button", { name: /^정산 요청$/ });
    await expect(requestBtn).toBeVisible();
    await requestBtn.first().click();
    await expect(page.getByText(/정산\s*요청|requested/i).first()).toBeVisible({
      timeout: 30_000,
    });

    // (3) instructor 페이지 새로고침 → bell unread 카운트 +1 검증.
    // Next.js 라우터 캐시/SSR 캐시 우회를 위해 cache-bust 쿼리를 붙인다.
    // bell 컴포넌트는 cookies() 호출로 dynamic 이지만 client-side router cache 가 끼어들 여지 차단.
    await instructorPage.goto(`/me?_cb=${Date.now()}`);
    // SSR 결과가 propagate 될 때까지 short polling — 알림 emit 은 동기 INSERT 이지만
    // 실제 환경에서 미세한 race 가 있어 5 회까지 재시도.
    let unreadAfter = await readUnreadCount(instructorPage);
    for (let i = 0; i < 5 && unreadAfter <= unreadBefore; i++) {
      await instructorPage.waitForTimeout(500);
      await instructorPage.goto(`/me?_cb=${Date.now()}_${i}`);
      unreadAfter = await readUnreadCount(instructorPage);
    }
    expect(unreadAfter, `instructor 의 bell 안읽음 카운트가 증가해야 함 (before=${unreadBefore}, after=${unreadAfter})`).toBeGreaterThan(unreadBefore);

    // (4) instructor dropdown 열고 최상단 항목 클릭 → mark-as-read.
    const bellBtn = instructorPage
      .getByRole("button", { name: /^알림(, 안읽음 \d+건)?$/ })
      .first();
    await bellBtn.click();
    const dropdownContent = instructorPage.locator('[role="menu"]');
    await expect(dropdownContent).toBeVisible({ timeout: 10_000 });
    const firstItem = dropdownContent.locator("a, button").first();
    await expect(firstItem).toBeVisible();
    await firstItem.click();

    // (5) 클릭 후 새 페이지 로드 또는 reload → unread 카운트 감소 검증.
    await instructorPage.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => null);
    await instructorPage.reload({ waitUntil: "domcontentloaded" });
    const unreadFinal = await readUnreadCount(instructorPage);
    expect(unreadFinal, `클릭 후 안읽음 카운트가 감소해야 함 (after=${unreadAfter}, final=${unreadFinal})`).toBeLessThan(unreadAfter);

    await instructorContext.close();
    console.warn(
      "[phase2-notify cleanup] 정산 상태 원복 API 부재 — paid 동결 정책 (SPEC-PAYOUT-001 §M5).",
    );
  });
});
