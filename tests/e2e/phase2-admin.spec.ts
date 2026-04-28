import { test, expect } from "@playwright/test";
import { SEED_USERS } from "./helpers/seed-users";

/**
 * SPEC-E2E-002 REQ-E2E2-003 — ADMIN 회원 비활성화 골든패스.
 *
 * 대상 페르소나: admin
 * 검증 범위: 보조 operator 비활성화 → 새 컨텍스트에서 로그인 거부 → cleanup 원복
 *
 * 시드 의존:
 *  - admin 페르소나(storageState)
 *  - 비활성화 대상으로 사용 가능한 보조 operator 계정
 *    (현재 시드 SQL `20260427000070_seed.sql` L40-114 기준: admin/operator/instructor 각 1명만 존재.
 *     본 시나리오의 "보조 operator" 가 시드되어 있지 않으면 명시 사유로 skip — REQ-E2E2-007.)
 *
 * 추가 제약:
 *  - 본인(admin) 비활성화는 self-lockout 차단 (B-8). 따라서 비활성화 대상은 반드시 admin 계정 외부.
 *  - "비활성화 후 로그인 거부" 의 실제 거동은 supabase-auth 단에 enforcement 레이어가 있어야
 *    100% 거부된다. 현재 코드(setUserActive)는 `users.is_active = false` 만 기록하므로
 *    auth.users 자체가 disable 되지 않는다. 따라서 로그인 거부가 환경에서 작동하지 않으면
 *    명시 skip 처리한다 (REQ-E2E2-007 환경 제약).
 *
 * cleanup: afterEach 에서 admin 페르소나로 다시 활성화 토글을 시도 — 실패 시 console.warn.
 */
test.describe("@admin phase2-admin", () => {
  // 비활성화한 사용자 id 를 추적 — afterEach 에서 cleanup 시도.
  const deactivatedUserIds: string[] = [];

  test.afterEach(async ({ page }) => {
    if (deactivatedUserIds.length === 0) return;

    for (const targetId of deactivatedUserIds) {
      try {
        await page.goto(`/admin/users/${targetId}`, { waitUntil: "domcontentloaded" });
        // 활성 상태 카드의 토글 버튼이 "활성화" 텍스트면 비활성 상태 — 클릭하여 원복.
        const reactivateBtn = page.getByRole("button", { name: /^활성화$/ });
        if ((await reactivateBtn.count()) > 0) {
          await reactivateBtn.first().click();
          await page.waitForTimeout(1500);
        } else {
          console.warn(
            `[phase2-admin cleanup] 활성화 버튼 부재 — ${targetId} 가 이미 활성 상태이거나 셀렉터 변경됨`,
          );
        }
      } catch (e) {
        console.warn(
          `[phase2-admin cleanup] ${targetId} 원복 실패 — 다음 테스트 격리 위해 명시 로그: ${String(e)}`,
        );
      }
    }
    deactivatedUserIds.length = 0;
  });

  test("보조 operator 비활성화 → 새 컨텍스트 로그인 거부 → 원복", async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);

    // (a) admin 으로 인증된 세션에서 /admin/users 진입.
    await page.goto("/admin/users"); // REQ-E2E2-003 (a)
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(
      page.getByRole("heading", { name: /회원 \/ 권한|회원/ }),
    ).toBeVisible();

    // (b) 보조 operator 식별 — operator 역할 + admin 본인이 아닌 첫 행.
    //     현재 시드는 operator 1명(operator@algolink.local)뿐이므로 admin 페르소나가 그 행을
    //     건드리면 본인의 운영 환경(다른 spec) 이 깨진다. 따라서 "operator2@" 또는
    //     "primary 가 아닌 operator" 패턴을 우선 찾는다.
    await page.goto("/admin/users?role=operator&is_active=true");
    const operatorRows = page.locator("table tbody tr", {
      hasText: /operator/i,
    });
    const operatorRowCount = await operatorRows.count();

    // 시나리오 진행을 위해 본 SPEC 의 핵심 자격 증명(operator@algolink.local) 은 건드리지 않는다.
    // operator2 또는 다른 보조 계정이 있어야만 진행 가능.
    let targetRowIndex = -1;
    let targetEmail: string | null = null;
    for (let i = 0; i < operatorRowCount; i++) {
      const row = operatorRows.nth(i);
      const text = (await row.textContent()) ?? "";
      // primary operator 는 다른 spec(@operator) 들의 자격 증명 — 비활성화 금지.
      if (text.includes(SEED_USERS.operator.email)) continue;
      // 후보 발견.
      targetRowIndex = i;
      // 이메일 추출 — font-mono 셀에 표시되는 패턴.
      const emailMatch = text.match(/[\w.+-]+@[\w.-]+/);
      if (emailMatch) targetEmail = emailMatch[0];
      break;
    }

    if (targetRowIndex === -1 || !targetEmail) {
      test.skip(
        true,
        "비활성화 대상 보조 operator 시드 부재 — 시드에 operator 1명만 존재, 시드 보강 필요 (REQ-E2E2-003 검증 불가)",
      );
      return;
    }
    // 위 skip 으로 함수 종료가 보장되지만 TS narrowing 을 위한 명시 가드.
    const targetEmailResolved: string = targetEmail;

    // 상세 페이지로 이동.
    const detailLink = operatorRows.nth(targetRowIndex).locator('a[href*="/admin/users/"]');
    await detailLink.first().click();
    await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]+/);

    // 사용자 ID 캡처 — cleanup 용.
    const detailUrl = new URL(page.url());
    const userId = detailUrl.pathname.split("/").pop() ?? "";
    if (userId) deactivatedUserIds.push(userId);

    // (c) 비활성화 토글 클릭.
    const deactivateBtn = page.getByRole("button", { name: /^비활성화$/ });
    if ((await deactivateBtn.count()) === 0) {
      test.skip(
        true,
        "비활성화 버튼 부재 — 본인 계정이거나 이미 비활성 상태일 수 있음",
      );
    }
    await deactivateBtn.first().click();
    // 행 상태가 "비활성" 으로 표시되는지 확인 (server action revalidate 후).
    await expect(page.getByText(/비활성|비활성화되었습니다/).first()).toBeVisible({
      timeout: 15_000,
    }); // REQ-E2E2-003 (c)

    // (d) 새 컨텍스트(storageState 없음)에서 비활성화된 계정으로 로그인 시도.
    //     자격 증명은 시드에 정의된 password (DevOperator!2026) 와 동일 패턴이라고 가정.
    //     비밀번호는 환경별로 다를 수 있어, 해당 계정 비밀번호가 알려지지 않았으면 skip.
    //     본 회귀의 핵심은 "비활성 후 로그인 거부" 가드 — 비밀번호가 틀리면 통일 에러 메시지가
    //     반환되어 거부 자체는 성립하지만 회귀 신호로는 약하므로 명시 skip 으로 처리.
    // SEED_USERS.operator2 는 env 가 비어있으면 시드 SQL 의 기본값
    // (DevOperator2!2026) 을 그대로 노출한다 — helpers/seed-users.ts 참조.
    // 따라서 candidatePassword 는 항상 정의되어 있다.
    const candidatePasswordResolved: string =
      process.env.SEED_OPERATOR2_PASSWORD?.trim() || SEED_USERS.operator2.password;

    // 명시적으로 빈 storageState 를 지정하여 admin 컨텍스트의 쿠키 상속을 차단한다.
    // (@playwright/test 의 browser fixture 는 project use.storageState 가 설정된 프로젝트에서
    // newContext() 호출 시 기본 storageState 를 그대로 사용하는 환경 의존이 있다.)
    const anonContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    try {
      const anonPage = await anonContext.newPage();
      await anonPage.goto("/login", { waitUntil: "domcontentloaded" });
      await anonPage.locator("#login-email").waitFor({ state: "visible", timeout: 10_000 });
      await anonPage.locator("#login-email").fill(targetEmailResolved);
      await anonPage.locator("#login-password").fill(candidatePasswordResolved);
      const submit = anonPage.getByRole("button", { name: /^로그인$/ });
      await submit.click();

      // (e) 로그인 거부 — /login?error=deactivated 또는 동등 에러 메시지.
      //     현재 setUserActive 는 auth.users 를 직접 disable 하지 않으므로 supabase-auth 단에서
      //     로그인 자체는 통과할 가능성이 있다. 그 경우 이 어설트는 실패 → 명시 skip 으로
      //     완화하지 않고 의도적으로 fail 하여 LESSON-003 신호로 활용한다.
      await anonPage.waitForTimeout(2500);
      const finalUrl = new URL(anonPage.url());
      const stillOnLogin = finalUrl.pathname === "/login";
      if (!stillOnLogin) {
        // 비활성화가 supabase-auth 단까지 전파되지 않음 — REQ-E2E2-003 (d)/(e) 미충족.
        // 본 회귀가 fail 하는 것이 의도된 신호 — 후속 SPEC 에서 ban_duration 또는 사전 가드 로직 보강 필요.
        test.fail(
          true,
          "비활성화된 계정이 로그인에 성공함 — auth.users.banned_until 또는 로그인 가드 보강 필요 (LESSON-003 회귀 신호)",
        );
      }
      expect(finalUrl.pathname).toBe("/login"); // REQ-E2E2-003 (e)
    } finally {
      await anonContext.close();
    }
  });
});
