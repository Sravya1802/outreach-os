// ─────────────────────────────────────────────────────────────────────────────
// Playwright config — minimal harness for OutreachOS e2e tests.
//
// PR-A is harness + one auth-page smoke test that runs against any frontend
// URL. It defaults to the production Vercel deployment so CI works without
// local infra; override with PLAYWRIGHT_BASE_URL=http://localhost:5173 to
// develop tests against a locally-running frontend.
//
// Browsers must be installed once:
//   npx playwright install chromium
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // Each test gets up to 30s. Network calls to prod are slower than local.
  timeout: 30_000,
  // Don't bake parallelism in yet — easier to debug a serial run while the
  // suite is small. Future PRs can enable `fullyParallel: true`.
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://outreach-jt.vercel.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
