/**
 * playwright.config.ts
 *
 * E2E (Playwright) tier skeleton — Tier 4, `10-e2e-specification.md`.
 * No spec files exist yet; those land in Phase 9 (all 16 journeys,
 * priority-ordered, per AKEWTutor-Backend-Test-Implementation-Journey.md),
 * once both the backend and frontend tracks are complete (§6). This config
 * only wires up the runner so `npx playwright test` already works — even
 * against zero real specs — satisfying Phase 0's exit criteria.
 *
 * Per 00-agent-rules.md Rule 8: E2E tests may never use vi.mock() or any
 * unit-test mocking utility. Third parties are faked only via sandbox mode
 * or the dedicated mock HTTP servers under tests/e2e/mock-servers/
 * (10-e2e-specification.md §10.1 item 3), started via globalSetup below.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PLAYWRIGHT_APP_PORT ?? '3001';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // E2E specs share one seeded test DB — see 10-e2e-specification.md §10.1 item 1.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  // Starts the mock-server harness (Chapa / Geez SMS / Brevo) before the
  // suite and tears it down after — see tests/e2e/mock-servers/globalSetup.ts.
  // Playwright runs globalSetup's returned function as globalTeardown, in
  // the same process, so the harness's in-memory server handles survive
  // between the two without needing a second file to re-derive them.
  globalSetup: './tests/e2e/mock-servers/globalSetup.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Boots the real backend (and, once the frontend track publishes one, the
  // real frontend dev server) against the disposable E2E test database.
  // Left commented until Phase 9 actually needs it, per journey §2 Phase 9 —
  // uncommenting this is that phase's first step, not Phase 0's.
  // webServer: {
  //   command: 'npm run dev',
  //   url: BASE_URL,
  //   reuseExistingServer: !process.env.CI,
  //   env: { NODE_ENV: 'test' },
  // },
});
