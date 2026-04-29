import { test, expect } from "@playwright/test";

/**
 * SPEC-MOBILE-001 — 모바일/태블릿 반응형 매트릭스 smoke test.
 *
 * 대상 페르소나: operator (@operator → playwright.config.ts grep)
 *
 * 검증 매트릭스: 5 viewport × 3 페이지 = 15 cell
 *
 * 각 cell 검증:
 *  1. <meta name="viewport" content="...width=device-width..."> 존재
 *  2. document.documentElement.scrollWidth <= window.innerWidth + 1 (가로 스크롤 0, 1px 부동소수 허용)
 *  3. 햄버거([aria-label="주 내비게이션 열기"]) 가시성 분기
 *     - viewport < lg (1024) → visible
 *     - viewport >= lg → hidden (lg:hidden)
 *  4. 사이드바(<aside aria-label="주 내비게이션">) 가시성 분기
 *     - viewport < lg → hidden (hidden lg:flex)
 *     - viewport >= lg → visible
 *
 * NOTE: lg breakpoint = 1024px. 1024는 desktop 분기에 포함된다(>=1024).
 * Tailwind `lg:hidden` 은 1024px 이상에서 숨김을 의미하므로 1024 viewport는
 * 햄버거 hidden + 사이드바 visible 가 정상 거동.
 *
 * 본 매트릭스는 SPEC-MOBILE-001 §1.4 Success Criteria 의
 *  - "viewport meta 적용"
 *  - "5개 viewport 모두 가로 스크롤 0"
 * 두 항목에 대한 자동화 회귀 가드. 터치 타겟 / Lighthouse / axe 등
 * 추가 항목은 후속 SPEC 또는 수동 검증 단계에서 다룬다.
 */

const VIEWPORTS = [
  { name: "iPhone SE", width: 320, height: 568, isMobile: true },
  { name: "iPhone 12", width: 375, height: 667, isMobile: true },
  { name: "iPad portrait", width: 768, height: 1024, isMobile: true },
  { name: "iPad Pro", width: 1024, height: 1366, isMobile: false },
  { name: "Desktop", width: 1440, height: 900, isMobile: false },
] as const;

const PAGES = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "Projects", path: "/projects" },
  { name: "Instructors", path: "/instructors" },
] as const;

test.describe("@operator SPEC-MOBILE-001 — Mobile responsive matrix", () => {
  for (const vp of VIEWPORTS) {
    test.describe(`Viewport ${vp.width}x${vp.height} (${vp.name})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      for (const pg of PAGES) {
        test(`${pg.name}: viewport meta + 가로 스크롤 0 + nav 분기`, async ({ page }) => {
          await page.goto(pg.path);
          await page.waitForLoadState("networkidle");

          // 1. viewport meta 존재 — Next.js 16 export const viewport API 결과물
          const viewportMeta = page.locator('meta[name="viewport"]');
          await expect(viewportMeta).toHaveAttribute("content", /width=device-width/);

          // 2. 가로 스크롤 0 — 의도적 가로 스크롤 영역(kanban) 외 페이지 본문 overflow 없어야 함
          const horizontal = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          }));
          expect(
            horizontal.scrollWidth,
            `${pg.name} @ ${vp.width}x${vp.height}: scrollWidth=${horizontal.scrollWidth} > innerWidth=${horizontal.innerWidth}`,
          ).toBeLessThanOrEqual(horizontal.innerWidth + 1);

          // 3. 햄버거 가시성 — < lg (< 1024) 에서 visible, >= lg 에서 hidden(lg:hidden)
          const hamburger = page.locator('[aria-label="주 내비게이션 열기"]');
          if (vp.isMobile) {
            await expect(
              hamburger,
              `${pg.name} @ ${vp.width}px: 햄버거가 모바일/태블릿에서 visible 이어야 함`,
            ).toBeVisible();
          } else {
            await expect(
              hamburger,
              `${pg.name} @ ${vp.width}px: 햄버거가 desktop(>=lg) 에서 hidden 이어야 함`,
            ).toBeHidden();
          }

          // 4. persistent sidebar 가시성 — >= lg 에서 visible, < lg 에서 hidden(hidden lg:flex)
          // Sidebar 는 mobile-nav 의 Sheet 내부에서도 동일 aria-label 로 렌더되므로
          // .first() 로 layout flow 상의 첫 번째 (= persistent) 사이드바를 타겟팅.
          const sidebar = page.locator('aside[aria-label="주 내비게이션"]').first();
          if (vp.isMobile) {
            await expect(
              sidebar,
              `${pg.name} @ ${vp.width}px: persistent sidebar 가 모바일/태블릿에서 hidden 이어야 함`,
            ).toBeHidden();
          } else {
            await expect(
              sidebar,
              `${pg.name} @ ${vp.width}px: persistent sidebar 가 desktop(>=lg) 에서 visible 이어야 함`,
            ).toBeVisible();
          }
        });
      }
    });
  }
});
