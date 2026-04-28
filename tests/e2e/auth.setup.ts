import { test as setup, expect } from "@playwright/test";
import { PERSONAS } from "./helpers/personas";

/**
 * 각 페르소나(admin/operator/instructor)별로 실제 /login 폼 제출 후
 * storageState를 디스크에 저장.
 *
 * 후속 페르소나 프로젝트가 dependencies: ['setup']으로 이 결과를 사용한다.
 *
 * SPEC-AUTH-001 §2.1 REQ-AUTH-LOGIN-001..006 (실제 Server Action을 통한 로그인 + 역할 기반 redirect).
 */

// dev 서버 첫 컴파일 + Server Action round-trip 고려하여 setup만 별도 timeout.
setup.setTimeout(120_000);

for (const persona of Object.values(PERSONAS)) {
  setup(`authenticate as ${persona.role}`, async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/login/);

    const submitBtn = page.getByRole("button", { name: /^로그인$/ });
    await expect(submitBtn).toBeEnabled();

    // ID 기반 셀렉터 — login-form.tsx의 #login-email / #login-password에 직접 대응.
    await page.locator("#login-email").fill(persona.email);
    await page.locator("#login-password").fill(persona.password);

    await Promise.all([
      page.waitForURL(
        (url) =>
          url.pathname === persona.homePath ||
          url.pathname.startsWith(persona.homePath + "/"),
        { timeout: 90_000 },
      ),
      submitBtn.click(),
    ]);

    // 실패 시 폼이 그대로 /login에 머물면 명확한 진단을 남긴다.
    const finalUrl = new URL(page.url());
    expect(finalUrl.pathname, `${persona.role} did not reach ${persona.homePath}`).not.toMatch(
      /\/login/,
    );

    await page.context().storageState({ path: persona.storageStatePath });
  });
}
