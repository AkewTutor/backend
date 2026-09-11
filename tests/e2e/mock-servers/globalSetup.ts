/**
 * tests/e2e/mock-servers/globalSetup.ts
 *
 * Playwright `globalSetup` entry point (playwright.config.ts). Starts the
 * combined mock-server harness (Chapa / Geez SMS / Brevo —
 * 10-e2e-specification.md §10.1 item 3) once before any E2E spec runs, and
 * returns a teardown function — Playwright calls the function a
 * `globalSetup` returns as its `globalTeardown`, in the same process, so
 * the harness's in-memory server handles (ports, captured-message arrays)
 * survive between the two without a second file needing to re-derive them.
 *
 * Individual E2E specs read captured payloads / trigger webhooks by
 * re-importing the specific mock server module against the well-known
 * ports (4001/4002/4003, matching .env.test's CHAPA_BASE_URL /
 * GEEZ_SMS_BASE_URL / BREVO_BASE_URL) rather than through this file.
 *
 * Phase 0, step 0.2 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 * Not exercised until Phase 9 (E2E) actually has spec files to run.
 */

import type { FullConfig } from '@playwright/test';
import { startMockServerHarness, stopMockServerHarness } from './index.js';

export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  const harness = await startMockServerHarness();

  return async function globalTeardown(): Promise<void> {
    await stopMockServerHarness(harness);
  };
}
