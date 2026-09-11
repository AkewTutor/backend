/**
 * vitest.config.ts
 *
 * Unit + Integration (HTTP contract) tier config — the two tiers that never
 * touch a real database (Prisma is always vi.mock()'d; supertest drives a
 * real Express app in-process). Explicitly excludes tests/integration/**,
 * which is the persistence tier's exclusive territory (vitest.integration.config.ts).
 *
 * Phase 0, step 0.1 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/env.setup.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', 'tests/e2e/**', 'node_modules/**'],
  },
});
