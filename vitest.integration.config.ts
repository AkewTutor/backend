/**
 * vitest.integration.config.ts
 *
 * Integration (persistence) tier config — real Prisma client, real
 * (disposable, seeded, isolated) test database, nothing mocked. Run
 * separately from vitest.config.ts (`npm run test:integration`) so an
 * unreachable test DB never silently downgrades a persistence suite into
 * skipped/passing (Rule 7, 00-agent-rules.md).
 *
 * Run serially (`fileParallelism: false`) — persistence suites share one
 * physical test database and truncate tables between cases via
 * tests/setup/testDb.ts's resetTestDb(); parallel files would race on the
 * same tables.
 *
 * Phase 0, step 0.1 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/env.setup.ts'],
    globalSetup: ['./tests/setup/globalSetup.integration.ts'],
    include: ['tests/integration/**/*.persistence.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
