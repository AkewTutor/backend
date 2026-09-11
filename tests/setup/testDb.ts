/**
 * tests/setup/testDb.ts
 *
 * The real, disposable-test-database Prisma client for the Integration
 * (persistence) tier only. Unit and Integration (HTTP contract) tests never
 * import this file — they mock `src/config/db.ts`'s `prisma` export
 * instead, per the tier table in
 * `AKEWTutor-Backend-Test-Implementation-Journey.md §0`.
 *
 * Rule 7 (`00-agent-rules.md`): "Any test marked Integration (persistence)
 * must run against the real test database — it may not silently fall back
 * to a mock if the test DB is unreachable; it must fail loudly." That is
 * exactly what `assertTestDbReachable` below does — it throws, it never
 * catches-and-mocks.
 *
 * Phase 0, step 0.1 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Fail loudly at import time — Rule 7. A missing DATABASE_URL in the
  // persistence tier is a configuration error, not something to paper over.
  throw new Error(
    '[tests/setup/testDb.ts] DATABASE_URL is not set. Integration (persistence) tests ' +
      'require a real, reachable test database — see .env.test and ' +
      '00-agent-rules.md Rule 7. Refusing to silently fall back to a mock.',
  );
}

if (!DATABASE_URL.includes('_test')) {
  // A second, cheap guard rail: never let a persistence test run — and
  // TRUNCATE — a database that doesn't look disposable.
  throw new Error(
    `[tests/setup/testDb.ts] DATABASE_URL ("${DATABASE_URL}") does not look like a ` +
      'disposable test database (expected the database name to contain "_test"). ' +
      'Refusing to run persistence tests against what may be a real database.',
  );
}

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);

/** Real Prisma client, pointed at the disposable test database. Nothing about this is mocked. */
export const testPrisma = new PrismaClient({ adapter });

/**
 * Fails loudly (throws) if the test database is unreachable. Call this in
 * every persistence-tier suite's `beforeAll` — never let a connectivity
 * failure be swallowed into "0 tests ran" or a silently-skipped suite.
 */
export async function assertTestDbReachable(): Promise<void> {
  try {
    await testPrisma.$queryRaw`SELECT 1`;
  } catch (err) {
    throw new Error(
      '[tests/setup/testDb.ts] Test database is unreachable at ' +
        `${DATABASE_URL}. Integration (persistence) tests may not fall back to a mock ` +
        '(Rule 7) — start it first, e.g. `docker compose up -d db` and ' +
        'create the akewtutor_test database, then re-run. ' +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Truncates every table in the `public` schema except Prisma's own
 * migration bookkeeping table, restarting identity sequences and cascading
 * FKs. Generic (introspects `information_schema` rather than naming
 * tables), so it keeps working as new tables land migration-by-migration
 * across Phases 1–8 without needing to be edited each time.
 *
 * Call from `beforeEach`/`afterEach` in persistence suites that need a
 * clean slate between test cases.
 */
export async function resetTestDb(): Promise<void> {
  const tables = await testPrisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const tableList = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
}

/** Closes the pool cleanly. Call from a persistence suite's `afterAll`. */
export async function disconnectTestDb(): Promise<void> {
  await testPrisma.$disconnect();
}
