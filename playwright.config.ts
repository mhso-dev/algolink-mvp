import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 설정 — 알고링크 MVP E2E.
 *
 * 동작:
 *  - `pnpm dev`로 dev 서버 자동 기동 (port 3000), 이미 떠 있으면 reuse.
 *  - `setup` 프로젝트가 admin/operator/instructor 3개 페르소나로 실제 로그인 후
 *    `tests/e2e/.auth/{role}.json`에 storageState 저장.
 *  - 페르소나별 프로젝트는 dependencies로 setup을 참조하여 격리된 세션 실행.
 *
 * SPEC 인덱스: SPEC-AUTH-001 / SPEC-DASHBOARD-001 / SPEC-INSTRUCTOR-001 /
 * SPEC-PROJECT-001 / SPEC-ME-001
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Server Action + DB I/O가 직렬화되는 dev 서버 특성상 worker 1로 안정성 우선.
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },

  // E2E는 production build에서 실행한다. dev 서버는 RSC + RHF hydration race로
  // 인해 Playwright이 click하는 시점에 onSubmit handler가 attach되지 않은
  // 경우가 있어 form이 native GET submit으로 폴백한다(자격 증명이 쿼리스트링에 노출).
  // build → start로 hydration 안정성을 확보.
  webServer: {
    command: "pnpm build && pnpm start -p 3000 -H 127.0.0.1",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "anon",
      testMatch: /.*\.spec\.ts/,
      grep: /@anon/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "instructor",
      testMatch: /.*\.spec\.ts/,
      grep: /@instructor/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/instructor.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "operator",
      testMatch: /.*\.spec\.ts/,
      grep: /@operator/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/operator.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "admin",
      testMatch: /.*\.spec\.ts/,
      grep: /@admin/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],
});
