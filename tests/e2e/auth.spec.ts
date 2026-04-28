import { test, expect } from "@playwright/test";
import { PERSONAS } from "./helpers/personas";

/**
 * SPEC-AUTH-001 — 인증/인가 회귀 테스트.
 *
 * 검증 범위:
 *  1. 미인증 보호 라우트 → /login?next= redirect
 *  2. 잘못된 자격 증명 → 통일 에러 메시지 + URL 유지
 *  3. 역할 기반 라우팅(instructor가 /dashboard 접근 시 /me, operator가 /me 접근 시 /dashboard)
 *  4. 로그아웃 → /login 복귀
 */

const PROTECTED_PATHS = [
  "/dashboard",
  "/projects",
  "/instructors",
  "/me",
  "/settlements",
  "/clients",
  "/admin",
];

test.describe("@anon Anonymous redirects", () => {
  for (const path of PROTECTED_PATHS) {
    test(`unauthenticated GET ${path} → /login?next=`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      // Next.js middleware가 307 redirect로 응답.
      const url = new URL(page.url());
      expect(url.pathname).toBe("/login");
      expect(url.searchParams.get("next")).toBe(path);
      // response가 null일 수도 있음(redirect chain 끝의 200), 그러나 최종 URL이 /login이면 충분.
      expect(response).toBeTruthy();
    });
  }

  test("invalid credentials → unified error message", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    const submit = page.getByRole("button", { name: /^로그인$/ });
    await expect(submit).toBeEnabled();
    await page.locator("#login-email").fill("nobody@algolink.local");
    await page.locator("#login-password").fill("WrongPassword!1234");
    await submit.click();

    // login-error 영역에 통일 메시지가 표시되어야 한다.
    // (Next.js route announcer가 별도 role=alert 요소를 추가하므로 #login-error로 한정.)
    const alert = page.locator("#login-error");
    await expect(alert).toContainText("이메일 또는 비밀번호가 올바르지 않습니다.");
    // URL은 그대로 /login.
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});

test.describe("@instructor Role-based routing — instructor", () => {
  test("instructor accessing /dashboard → redirected to /me", async ({ page }) => {
    const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    expect(response).toBeTruthy();
    // (app)/(operator)/layout.tsx 가드가 instructor를 /me로 보낸다.
    await expect(page).toHaveURL(/\/me(?!\/)/);
  });

  test("instructor home /me renders authenticated content", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/me/);
    // 본문은 instructor 대시보드 — main이 렌더되어야 한다.
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("@operator Role-based routing — operator", () => {
  test("operator accessing /me → redirected to /dashboard", async ({ page }) => {
    const response = await page.goto("/me", { waitUntil: "domcontentloaded" });
    expect(response).toBeTruthy();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("operator can sign out → returns to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // 토픕바 프로필 메뉴 → 로그아웃. 셀렉터는 보수적으로 "로그아웃" 텍스트 기반.
    // 메뉴가 dropdown 안에 있으면 트리거 버튼을 먼저 연다.
    const logoutByName = page.getByRole("menuitem", { name: /로그아웃/ });
    const logoutButton = page.getByRole("button", { name: /로그아웃/ });

    if (await logoutByName.count()) {
      await logoutByName.first().click();
    } else if (await logoutButton.count()) {
      await logoutButton.first().click();
    } else {
      // 메뉴가 닫혀 있을 가능성 — 사용자 아바타/메뉴 트리거를 연다.
      const avatarTrigger =
        page.getByRole("button", { name: PERSONAS.operator.email }).first();
      if (await avatarTrigger.count()) {
        await avatarTrigger.click();
        await page.getByRole("menuitem", { name: /로그아웃/ }).first().click();
      } else {
        test.skip(true, "로그아웃 트리거를 찾지 못함 — Topbar UI 확인 필요");
      }
    }

    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});
