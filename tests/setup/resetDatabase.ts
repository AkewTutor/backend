/**
 * tests/setup/resetDatabase.ts
 *
 * Truncates a caller-specified list of tables against the real test
 * database (via `src/config/db.ts`'s `prisma`, which — under `.env.test` —
 * points at the same disposable database as `tests/setup/testDb.ts`'s
 * `testPrisma`). CASCADE handles FK ordering regardless of the order the
 * table names are passed in, and identity sequences are restarted so
 * autoincrement/row-order assumptions stay stable between tests.
 *
 * Distinct from `tests/setup/testDb.ts`'s `resetTestDb()`, which
 * introspects and truncates *every* table generically — this variant lets
 * a suite reset only the tables it actually touches.
 */

import { prisma } from '../../src/config/db.js';

export async function resetDatabase(tables: string[]): Promise<void> {
  if (!tables || tables.length === 0) {
    return;
  }

  const tableList = tables.map((t) => `"public"."${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
}
