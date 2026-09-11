/**
 * tests/integration/phase0-smoke.persistence.test.ts
 *
 * The trivial round-trip check AKEWTutor-Backend-Test-Implementation-Journey.md
 * §"Phase 0" requires before moving on to Phase 1: "test DB spins up
 * clean, a trivial round-trip test (write 1 row via a factory, read it
 * back) passes, and vitest run / playwright test both execute."
 *
 * KNOWN RED STATE, BY DESIGN: `prisma/schema.prisma` in this repo is still
 * the bare template placeholder with zero models (see
 * tests/factories/types.ts's header comment). `testPrisma.user` does not
 * exist until a `User` model is added to the schema and `prisma generate` /
 * `prisma migrate dev` have run. Per Rule 1 (00-agent-rules.md), this test
 * is written first, before that implementation — it is expected to fail
 * until schema.prisma + a migration exist, at which point it goes green
 * with no changes needed here. Do not weaken this assertion to make it
 * pass early (Rule 2) — the schema being genuinely missing is a real gap,
 * not a reason to skip or soften the check.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildUser } from '../factories/shared-config.factory.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';

describe('Phase 0 smoke — test DB round-trip', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('writes a User row via the shared-config factory and reads it back', async () => {
    const fixture = buildUser({ email: 'phase0-smoke@example.test' });

    // PrismaClient until schema.prisma defines the User model; see header comment.
    const created = await (testPrisma as any).user.create({ data: fixture });
    expect(created.id).toBe(fixture.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = await (testPrisma as any).user.findUnique({ where: { id: fixture.id } });
    expect(found).not.toBeNull();
    expect(found.email).toBe('phase0-smoke@example.test');
  });
});
