import { test, expect } from "@playwright/test";
import { PERSONAS } from "./helpers/personas";
import { SEED_USERS } from "./helpers/seed-users";

/**
 * SPEC-AUTH-001 — 인증/인가 회귀 테스트.
 * SPEC-E2E-001 stage 1 REQ-E2E-002 보강: 3 역할 성공 로그인 + 보호 라우트 미인증 차단.
 *
 * 검증 범위:
 *  1. 미인증 보호 라우트 → /login?next= redirect
 *  2. 쿠키 제거 후 보호 페이지 접근 → /login 으로 복귀
 *  3. 잘못된 자격 증명 → 통일 에러 메시지 + URL 유지
 *  4. 3 역할(admin/operator/instructor) 성공 로그인 → 역할별 home 도착
 *  5. 역할 기반 라우팅(instructor가 /dashboard 접근 시 /me, operator가 /me 접근 시 /dashboard)
 *  6. 로그아웃 → /login 복귀
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

  test("session 쿠키 제거 후 /projects 접근 → /login redirect", async ({ page, context }) => {
    // 미인증 상태 보장: anon project 는 storageState 없음이지만 명시적으로 한 번 더 비운다.
    await context.clearCookies();
    await page.goto("/projects", { waitUntil: "domcontentloaded" });
    expect(new URL(page.url()).pathname).toBe("/login");
  });

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

test.describe("@anon Successful login per role lands at home", () => {
  // 3 역할의 자격 증명을 받아 /login 폼을 직접 제출 → 역할 home 도착을 확인.
  // setup 프로젝트와 별도로, REQ-E2E-002(a) "성공 로그인 → 역할별 랜딩" 을 명시적으로 회귀 검증.
  for (const role of ["admin", "operator", "instructor"] as const) {
    test(`${role} login → ${PERSONAS[role].homePath}`, async ({ page, context }) => {
      test.setTimeout(90_000);
      await context.clearCookies();
      await page.goto("/login", { waitUntil: "networkidle" });
      await page.locator("#login-email").fill(SEED_USERS[role].email);
      await page.locator("#login-password").fill(SEED_USERS[role].password);
      const submit = page.getByRole("button", { name: /^로그인$/ });
      await Promise.all([
        page.waitForURL(
          (url) =>
            url.pathname === PERSONAS[role].homePath ||
            url.pathname.startsWith(PERSONAS[role].homePath + "/"),
          { timeout: 60_000 },
        ),
        submit.click(),
      ]);
      const finalPath = new URL(page.url()).pathname;
      expect(finalPath).not.toMatch(/\/login/);
      // operator/admin → /dashboard, instructor → /me 로 시작.
      expect(finalPath.startsWith(PERSONAS[role].homePath)).toBe(true);
    });
  }
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

    // 토픕바 프로필 메뉴 트리거 — Topbar 컴포넌트의 DropdownMenuTrigger 는
    // aria-label="프로필 메뉴 열기" 를 사용한다 (src/components/app/topbar.tsx).
    const menuTrigger = page.getByRole("button", { name: "프로필 메뉴 열기" });
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.click();

    // 드롭다운 열린 후 "로그아웃" menuitem 클릭. shadcn DropdownMenuItem 은 menuitem role.
    const logoutItem = page.getByRole("menuitem", { name: /로그아웃/ });
    await expect(logoutItem).toBeVisible();
    await logoutItem.click();

    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});
