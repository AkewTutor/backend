/**
 * tests/integration/auth.service.persistence.test.ts
 *
 * Journey step 1.23 (final file of Phase 1). Spec: `9-1-shared-config-persistence.md`
 * §9.22–9.25. Sibling of `09-1-shared-config.md` (Unit + Integration (HTTP
 * contract) tiers).
 * FRs: FR-SP-003. NFRs: NFR-013, NFR-014, NFR-015.
 * Traces to `04-database-and-data-model.md` §4.2 (RefreshToken) and §4.4
 * (RefreshToken indexes/constraints).
 *
 * KNOWN RED STATE, BY DESIGN — same reason as
 * tests/integration/phase0-smoke.persistence.test.ts: `prisma/schema.prisma`
 * is still the bare template placeholder with zero models. `testPrisma.user`,
 * `.refreshToken`, and `.auditLog` do not exist until the corresponding
 * models land and a migration runs. Written first per Rule 1
 * (00-agent-rules.md) — expected to fail until then, at which point it goes
 * green with no changes needed here (Rule 2: do not weaken to pass early).
 *
 * Nothing in this file mocks `src/config/db.ts` — `auth.service.ts`'s own
 * `prisma` import reads the identical `DATABASE_URL` this suite's
 * `tests/setup/env.setup.ts` loads from `.env.test` (see `src/config/db.ts`
 * / `src/config/env.ts`), so calling the real exported service functions
 * below exercises the real test database directly, per Rule 3 of the test
 * environment convention in the spec doc. `testPrisma` (a second client on
 * the same physical database) is used only for out-of-band seeding/
 * verification queries, exactly as the Phase 0 smoke test already
 * establishes the pattern.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildUser } from '../factories/shared-config.factory.js';
import {
  assertTestDbReachable,
  disconnectTestDb,
  resetTestDb,
  testPrisma,
} from '../setup/testDb.js';
import { hashPassword } from '../../src/utils/password.js';
import { login, refreshAccessToken } from '../../src/services/auth.service.js';
import ApiError from '../../src/utils/ApiError.js';

const KNOWN_PASSWORD = 'correct-horse-battery-staple';

/** Seeds a real, persisted User with a real bcrypt hash of KNOWN_PASSWORD. */
async function seedRealUser(overrides: Parameters<typeof buildUser>[0] = {}) {
  const passwordHash = await hashPassword(KNOWN_PASSWORD);
  const fixture = buildUser({ passwordHash, ...overrides });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see header comment (bare schema).
  return (testPrisma as any).user.create({ data: fixture });
}

/** Real login against the real DB — returns the raw refresh token + the created row. */
async function realLoginFor(user: { email: string | null; phone: string | null }) {
  const identifier = (user.email ?? user.phone) as string;
  const result = await login(identifier, KNOWN_PASSWORD);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (testPrisma as any).refreshToken.findFirst({
    where: { revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return { ...result, row };
}

describe('auth.service.ts — Integration (persistence)', () => {
  beforeAll(async () => {
    await assertTestDbReachable();
  });

  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  describe('refreshAccessToken — real rotation, durably correct', () => {
    it('rotation is real and atomic — presented row revoked + points at a real, different active child', async () => {
      const user = await seedRealUser({ email: 'rotate@example.test' });
      const { refreshToken: rawToken, row: originalRow } = await realLoginFor(user);

      await refreshAccessToken(rawToken);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const presentedAfter = await (testPrisma as any).refreshToken.findUnique({
        where: { id: originalRow.id },
      });
      expect(presentedAfter.revokedAt).not.toBeNull();
      expect(presentedAfter.replacedByTokenId).not.toBeNull();
      expect(presentedAfter.replacedByTokenId).not.toBe(originalRow.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const childRow = await (testPrisma as any).refreshToken.findUnique({
        where: { id: presentedAfter.replacedByTokenId },
      });
      expect(childRow).not.toBeNull();
      expect(childRow.revokedAt).toBeNull();
      expect(childRow.familyId).toBe(originalRow.familyId);
    });

    it('the tokenHash unique constraint is real — a direct duplicate insert is rejected (P2002)', async () => {
      const user = await seedRealUser({ email: 'unique-constraint@example.test' });
      const { row: originalRow } = await realLoginFor(user);

      let caught: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (testPrisma as any).refreshToken.create({
          data: {
            id: `${originalRow.id}-dup`,
            userId: user.id,
            tokenHash: originalRow.tokenHash,
            familyId: originalRow.familyId,
            expiresAt: originalRow.expiresAt,
            createdByIp: '127.0.0.1',
            userAgent: 'vitest-fixture',
          },
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect(caught.code).toBe('P2002');
    });

    it('concurrent refresh race on the same still-valid token — exactly one caller rotates it', async () => {
      const user = await seedRealUser({ email: 'race@example.test' });
      const { refreshToken: rawToken, row: originalRow } = await realLoginFor(user);

      const results = await Promise.allSettled([
        refreshAccessToken(rawToken),
        refreshAccessToken(rawToken),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        statusCode: 401,
        message: 'Session expired — please log in again',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const presentedAfter = await (testPrisma as any).refreshToken.findUnique({
        where: { id: originalRow.id },
      });
      expect(presentedAfter.revokedAt).not.toBeNull();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const children = await (testPrisma as any).refreshToken.findMany({
        where: { familyId: originalRow.familyId, id: { not: originalRow.id } },
      });
      expect(children).toHaveLength(1);
    });
  });

  describe('refreshAccessToken — real reuse detection', () => {
    it('reuse of an already-rotated token revokes every real row in the family', async () => {
      const user = await seedRealUser({ email: 'reuse@example.test' });
      const { refreshToken: rawToken, row: originalRow } = await realLoginFor(user);

      await refreshAccessToken(rawToken); // real rotation, produces a real child

      await expect(refreshAccessToken(rawToken)).rejects.toMatchObject({
        statusCode: 401,
        message: 'Session expired — please log in again',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const familyRows = await (testPrisma as any).refreshToken.findMany({
        where: { familyId: originalRow.familyId },
      });
      expect(familyRows.length).toBeGreaterThanOrEqual(2);
      expect(familyRows.every((r: any) => r.revokedAt !== null)).toBe(true);
    });

    it("reuse detection does not touch a different user's family", async () => {
      const userA = await seedRealUser({ email: 'reuse-a@example.test' });
      const userB = await seedRealUser({ email: 'reuse-b@example.test' });
      const { refreshToken: rawTokenA, row: rowA } = await realLoginFor(userA);
      const { row: rowB } = await realLoginFor(userB);

      await refreshAccessToken(rawTokenA); // rotate A once for real
      await expect(refreshAccessToken(rawTokenA)).rejects.toThrow(); // trigger reuse detection on A

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const familyBRows = await (testPrisma as any).refreshToken.findMany({
        where: { familyId: rowB.familyId },
      });
      expect(familyBRows).toHaveLength(1);
      expect(familyBRows[0].revokedAt).toBeNull();
      expect(familyBRows[0].id).toBe(rowB.id);
    });

    it('a three-generation-deep chain is revoked in full on reuse of the oldest (grandparent) token', async () => {
      const user = await seedRealUser({ email: 'three-gen@example.test' });
      const { refreshToken: grandparentRawToken, row: grandparentRow } = await realLoginFor(user);

      const gen2 = await refreshAccessToken(grandparentRawToken);
      await refreshAccessToken(gen2.refreshToken); // now three real generations exist

      await expect(refreshAccessToken(grandparentRawToken)).rejects.toMatchObject({
        statusCode: 401,
        message: 'Session expired — please log in again',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const familyRows = await (testPrisma as any).refreshToken.findMany({
        where: { familyId: grandparentRow.familyId },
      });
      expect(familyRows).toHaveLength(3);
      expect(familyRows.every((r: any) => r.revokedAt !== null)).toBe(true);
    });
  });

  describe('User deletion — real cascade behavior', () => {
    it('deleting a User real-cascades its RefreshToken rows (the schema’s one deliberate cascade exception)', async () => {
      const user = await seedRealUser({ email: 'cascade@example.test' });
      await realLoginFor(user); // device 1
      await realLoginFor(user); // device 2

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const beforeDelete = await (testPrisma as any).refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(beforeDelete).toHaveLength(2);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (testPrisma as any).user.delete({ where: { id: user.id } });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const afterDelete = await (testPrisma as any).refreshToken.findMany({
        where: { userId: user.id },
      });
      expect(afterDelete).toHaveLength(0);
    });
  });

  describe("login's LOGIN_FAILED_THRESHOLD audit entry — durable persistence", () => {
    it('the threshold-crossing attempt (the Nth) durably persists a real AuditLog entry', async () => {
      const { LOGIN_RATE_LIMIT } = await import('../../src/config/rateLimits.js');
      const N = LOGIN_RATE_LIMIT.max;
      const user = await seedRealUser({ email: 'audit-threshold@example.test' });

      for (let i = 0; i < N - 1; i += 1) {
        await login(user.email, 'wrong-password').catch(() => undefined);
      }
      await login(user.email, 'wrong-password').catch(() => undefined); // the Nth

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const auditRows = await (testPrisma as any).auditLog.findMany({
        where: { actor: user.id, action: 'LOGIN_FAILED_THRESHOLD', target: user.id },
      });
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
      expect(auditRows[0].timestamp).toBeTruthy();
    });

    it('the (N − 1)th failed attempt — one short of the threshold — writes no audit entry', async () => {
      const { LOGIN_RATE_LIMIT } = await import('../../src/config/rateLimits.js');
      const N = LOGIN_RATE_LIMIT.max;
      const user = await seedRealUser({ email: 'audit-below-threshold@example.test' });

      for (let i = 0; i < N - 1; i += 1) {
        await login(user.email, 'wrong-password').catch(() => undefined);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const auditRows = await (testPrisma as any).auditLog.findMany({
        where: { actor: user.id, action: 'LOGIN_FAILED_THRESHOLD', target: user.id },
      });
      expect(auditRows).toHaveLength(0);
    });
  });
});
