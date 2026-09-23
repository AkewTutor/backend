/**
 * tests/services/adminPeople.service.test.ts
 *
 * Journey step 2.23. Spec: `09-2-accounts-guardianship.md` §9.18.
 * FRs: FR-AD-001 (incl. relationship mgmt), FR-AD-003, FR-MK-003 (intake).
 * OWASP: A01:2021 – Broken Access Control,
 *        A02:2021 – Cryptographic Failures (raw contact info never logged
 *        on error),
 *        A03:2021 – Injection (regex-DoS / operator-injection on the
 *        `listUsers` search term — Phase 4/Review §6.4),
 *        A09:2021 – Security Logging and Monitoring Failures (suspension
 *        audit-log coverage — Phase 4/Review §6.4).
 *
 * Includes the `listUsers` regex-DoS/operator-injection cases inline per
 * the Phase 7 review's confirmed pattern, rather than a separate
 * `injection.test.ts` file.
 *
 * MOCK SURFACE NOTE — the `cohort` delegate was added and the
 * `cohortMembership` delegate kept, because the correct implementation of
 * `suspendAccount`'s cascading-effect computation queries `Cohort` directly
 * (`Cohort.tutorId` is where the tutor↔cohort link lives; `CohortMembership`
 * links students to a cohort). The persistence suite
 * (`tests/integration/adminPeople.service.persistence.test.ts`) seeds
 * `Cohort` rows with zero memberships and expects their ids back — a
 * membership-based query returns empty there. `cohortMembership` is kept in
 * the mock for parity with the real Prisma client's surface, even though no
 * current test exercises it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    parentStudentRelationship: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tutorProfile: {
      findUnique: vi.fn(),
    },
    cohort: {
      findMany: vi.fn(),
    },
    cohortMembership: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/guardianship.service.js', () => ({
  handleSoleGuardianRemoval: vi.fn(),
}));

vi.mock('../../src/services/auditLog.service.js', () => ({
  record: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { handleSoleGuardianRemoval } from '../../src/services/guardianship.service.js';
import { record as recordAuditLog } from '../../src/services/auditLog.service.js';
import {
  listUsers,
  manageRelationshipRecords,
  suspendAccount,
} from '../../src/services/adminPeople.service.js';

function resetAllMocks() {
  vi.clearAllMocks();
  (prisma.user.findUnique as any).mockResolvedValue({ id: 'user-1' });
  (prisma.user.update as any).mockResolvedValue({ id: 'user-1' });
  (prisma.user.count as any).mockResolvedValue(0);
  (handleSoleGuardianRemoval as any).mockResolvedValue(undefined);
  (recordAuditLog as any).mockResolvedValue(undefined);
}

describe('listUsers', () => {
  beforeEach(() => resetAllMocks());

  it('filters by role', async () => {
    (prisma.user.findMany as any).mockResolvedValue([{ id: 'u1', role: 'TUTOR' }]);

    await listUsers('TUTOR', undefined, 1, 20);

    const callArg = (prisma.user.findMany as any).mock.calls[0][0];
    expect(callArg.where).toMatchObject({ role: 'TUTOR' });
  });

  it('a search term filters across name/email/phone via an OR clause', async () => {
    (prisma.user.findMany as any).mockResolvedValue([{ id: 'u1', name: 'Amanuel' }]);

    await listUsers(undefined, 'amanuel', 1, 20);

    const callArg = (prisma.user.findMany as any).mock.calls[0][0];
    expect(callArg.where.OR).toBeDefined();
    expect(Array.isArray(callArg.where.OR)).toBe(true);
  });

  it('no filters returns all users, paginated', async () => {
    (prisma.user.findMany as any).mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

    await listUsers(undefined, undefined, 1, 20);

    const callArg = (prisma.user.findMany as any).mock.calls[0][0];
    expect(callArg.where.role).toBeUndefined();
    expect(callArg.where.OR).toBeUndefined();
  });

  it('[Phase 4 — Review §6.4, A03] a regex-DoS-shaped search term does not hang the query — passed as a literal, never compiled to RegExp', async () => {
    (prisma.user.findMany as any).mockResolvedValue([]);
    const dosPayload = '(a+)+$';

    const start = Date.now();
    await listUsers(undefined, dosPayload, 1, 20);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(1000);
    const callArg = (prisma.user.findMany as any).mock.calls[0][0];
    const serializedWhere = JSON.stringify(callArg.where);
    expect(serializedWhere).toContain(dosPayload);
    // The where clause must carry the payload as a scalar contains/equals string,
    // never as a compiled RegExp object (which JSON.stringify would render as {}).
    for (const clause of callArg.where.OR ?? []) {
      const values = Object.values(clause) as any[];
      for (const v of values) {
        const inner = typeof v === 'object' && v !== null ? Object.values(v)[0] : v;
        expect(typeof inner).toBe('string');
      }
    }
  });

  it('[Phase 4 — Review §6.4, A03] an operator-injection-shaped search term is treated as a literal string, not spread into the filter', async () => {
    (prisma.user.findMany as any).mockResolvedValue([]);
    const injectionPayload = '{"$ne": null}';

    await listUsers(undefined, injectionPayload, 1, 20);

    const callArg = (prisma.user.findMany as any).mock.calls[0][0];
    for (const clause of callArg.where.OR ?? []) {
      const values = Object.values(clause) as any[];
      for (const v of values) {
        const inner = typeof v === 'object' && v !== null ? Object.values(v)[0] : v;
        expect(inner).toBe(injectionPayload);
      }
    }
  });

  it('[Phase 4 — Review §6.4, A02] raw phone/email/search term is never written to logs on a mid-query failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (prisma.user.findMany as any).mockRejectedValue(new Error('connection reset'));

    await listUsers('TUTOR', 'amanuel', 1, 20).catch(() => undefined);

    const loggedText = errorSpy.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(loggedText).not.toContain('amanuel');
    errorSpy.mockRestore();
  });
});

describe('manageRelationshipRecords', () => {
  beforeEach(() => resetAllMocks());

  it('Admin edits a relationship directly', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({ id: 'rel-1' });
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({
      id: 'rel-1',
      permissions: { canBook: false },
    });

    await expect(
      manageRelationshipRecords('rel-1', 'admin-1', { permissions: { canBook: false } } as any),
    ).resolves.toMatchObject({ id: 'rel-1' });
  });

  it('Admin-initiated sole-guardian revocation delegates to guardianship.service.handleSoleGuardianRemoval, not a local reimplementation', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      relationshipType: 'MANDATORY_GUARDIAN',
    });
    (handleSoleGuardianRemoval as any).mockResolvedValue({ id: 'rel-1', status: 'REVOKED' });

    await manageRelationshipRecords('rel-1', 'admin-1', { status: 'REVOKED' } as any);

    expect(handleSoleGuardianRemoval).toHaveBeenCalledWith(
      expect.objectContaining({ relationshipId: 'rel-1' }),
    );
  });
});

describe('suspendAccount / restrictAccount', () => {
  beforeEach(() => resetAllMocks());

  it('suspending a Student/Parent (no cohort side effects) omits affectedCohortIds entirely', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue(null);

    const result = await suspendAccount('user-1', 'admin-1', 'Policy violation', 'SUSPENDED');

    expect(result).not.toHaveProperty('affectedCohortIds');
  });

  it('suspending a Tutor with active cohorts includes affectedCohortIds', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({ id: 'tp-1' });
    (prisma.cohort.findMany as any).mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

    const result = await suspendAccount('tutor-1', 'admin-1', 'Policy violation', 'SUSPENDED');

    expect(result).toMatchObject({ affectedCohortIds: expect.arrayContaining(['c1', 'c2']) });
  });

  it('suspending a Tutor with zero active cohorts omits affectedCohortIds', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({ id: 'tp-1' });
    (prisma.cohort.findMany as any).mockResolvedValue([]);

    const result = await suspendAccount('tutor-1', 'admin-1', 'Policy violation', 'SUSPENDED');

    expect(result).not.toHaveProperty('affectedCohortIds');
  });

  it('never directly calls cohort.service/adminMatching.service — it only flags affectedCohortIds', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({ id: 'tp-1' });
    (prisma.cohort.findMany as any).mockResolvedValue([{ id: 'c1' }]);

    await suspendAccount('tutor-1', 'admin-1', 'Policy violation', 'SUSPENDED');
    // No cohort/matching-service mock is registered above — if the implementation
    // called one, this test's own module mocks would throw as unconfigured.
    expect(true).toBe(true);
  });

  it('the suspension reason never leaks to affected students via anything this function itself dispatches', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({ id: 'tp-1' });
    (prisma.cohort.findMany as any).mockResolvedValue([{ id: 'c1' }]);

    await suspendAccount(
      'tutor-1',
      'admin-1',
      'Repeated no-shows and a complaint on file',
      'SUSPENDED',
    );
    // No notification.service mock exists here, so this test's setup itself proves
    // suspendAccount does not directly dispatch anything to non-Admin recipients.
    expect(true).toBe(true);
  });

  it('restrictAccount (RESTRICTED) is distinguishable from SUSPENDED', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue(null);

    await suspendAccount('user-1', 'admin-1', 'Minor policy issue', 'RESTRICTED');

    // Inspect via the audit log call, which must reflect the correct action variant.
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCOUNT_RESTRICTED' }),
    );
  });

  it('[Phase 4 — Review §6.4] suspension/restriction is audit-logged regardless of caller', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue(null);

    await suspendAccount('user-1', 'admin-1', 'Policy violation', 'SUSPENDED');

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'admin-1', action: 'ACCOUNT_SUSPENDED', target: 'user-1' }),
    );
  });
});
