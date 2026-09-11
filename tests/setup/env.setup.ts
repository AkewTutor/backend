/**
 * tests/setup/env.setup.ts
 *
 * Vitest `setupFiles` entry, wired into both vitest.config.ts (Unit /
 * Integration HTTP-contract) and vitest.integration.config.ts (Integration
 * persistence). Loads `.env.test` before any test file's module graph
 * evaluates `src/config/env.ts`, so `process.env.DATABASE_URL` etc. are
 * always the disposable test values, never whatever is in a developer's
 * local `.env`.
 *
 * Phase 0, step 0.1 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env.test'), override: true });
