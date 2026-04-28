import { test, expect } from "@playwright/test";

/**
 * 역할 간 권한 경계(RBAC) 회귀 — admin/operator/instructor 가 자기 역할 외
 * 라우트 접근 시 차단되는지 검증.
 *
 * SPEC: SPEC-AUTH-001 §2.7 (RBAC), src/app/(app)/(admin)/layout.tsx requireRole('admin').
 *
 * 차단 동작:
 *  - operator/instructor 가 /admin/* 접근 → /dashboard 또는 /me 로 redirect
 *    (requireRole 은 redirect 가 아니라 throw 하지만, 상위 layout 가 잡거나 redirect.
 *     실제 결과: requireRole 실패 시 currentUser 의 home 으로 redirect.)
 *  - instructor 가 operator 전용 (/clients, /projects/new 등) 접근 → /me 로 redirect.
 *
 * 검증 방법: 각 페르소나로 금지 라우트에 직접 접근 → 자신의 home 으로 돌려보내짐 확인.
 */

const FORBIDDEN_FOR_OPERATOR = [
  "/admin/users",
  "/admin/dashboard",
];

const FORBIDDEN_FOR_INSTRUCTOR = [
  "/admin/users",
  "/admin/dashboard",
  "/clients",
  "/clients/new",
  "/projects/new",
  "/instructors/new",
  "/settlements",
];

test.describe("@operator RBAC — operator cannot access /admin", () => {
  for (const path of FORBIDDEN_FOR_OPERATOR) {
    test(`operator GET ${path} → /dashboard 으로 차단`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      // requireRole 차단 후 redirect 또는 not-found page; 어느 경우든
      // /admin pathname 에 머무르면 안 된다.
      const finalPath = new URL(page.url()).pathname;
      expect(finalPath, `operator 가 ${path} 에 접근 가능 — RBAC 회귀`).not.toMatch(
        /^\/admin/,
      );
    });
  }
});

test.describe("@instructor RBAC — instructor cannot access operator/admin routes", () => {
  for (const path of FORBIDDEN_FOR_INSTRUCTOR) {
    test(`instructor GET ${path} → home 으로 차단`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const finalPath = new URL(page.url()).pathname;
      expect(finalPath, `instructor 가 ${path} 에 접근 가능 — RBAC 회귀`).toMatch(
        /^\/(me|login)/,
      );
    });
  }
});
