/**
 * tests/setup/globalSetup.integration.ts
 *
 * Vitest `globalSetup` for vitest.integration.config.ts. Runs once before
 * any Integration (persistence) test file, in a separate process from the
 * test files themselves (Vitest's globalSetup contract) — so a DB-down
 * failure here aborts the whole run with one clear error instead of N
 * individual suites each failing in a confusing way.
 *
 * Rule 7 (`00-agent-rules.md`): fail loudly, never fall back to a mock.
 *
 * Phase 0, step 0.1 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';

export default async function globalSetup(): Promise<void> {
  config({ path: resolve(process.cwd(), '.env.test'), override: true });

  // Re-implemented inline (rather than imported from testDb.ts) because
  // Vitest's globalSetup runs in its own short-lived process, separate from
  // the worker process(es) that actually import tests/setup/testDb.ts — an
  // imported PrismaClient instance here would just be discarded after this
  // function returns.
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { Pool } = await import('pg');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      '[globalSetup.integration] DATABASE_URL is not set — see .env.test. ' +
        'Integration (persistence) tests require a real, reachable test database (Rule 7).',
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      `[globalSetup.integration] Test database unreachable at ${databaseUrl}. ` +
        'Refusing to run the Integration (persistence) suite against a mock (Rule 7). ' +
        'Start it first, e.g. `docker compose up -d db`, ensure the akewtutor_test ' +
        `database exists, then re-run \`npm run test:integration\`. Original error: ${
          err instanceof Error ? err.message : String(err)
        }`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
