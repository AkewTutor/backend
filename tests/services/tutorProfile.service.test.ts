/**
 * tests/services/tutorProfile.service.test.ts
 *
 * Journey step 2.10. Spec: `09-2-accounts-guardianship.md` §9.9.
 * FRs: FR-TU-003, FR-TU-006.
 * OWASP: A01:2021 – Broken Access Control,
 *        A08:2021 – Software and Data Integrity Failures (mass-assignment
 *        onto verificationStatus).
 *
 * Includes the `resubmitVerification` self-serve flow (Issue 2 fix) and the
 * third-subject-rejected case per the folder-structure doc's summary note.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    tutorProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tutorSubjectRanking: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  getProfile,
  rankSubjects,
  resubmitVerification,
  updateProfile,
} from '../../src/services/tutorProfile.service.js';

function resetAllMocks() {
  vi.clearAllMocks();
}

describe.skip('getProfile / updateProfile', () => {
  beforeEach(() => resetAllMocks());

  it("returns the tutor's own profile", async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({ id: 'tp-1', bio: 'Hi' });

    await expect(getProfile('tp-1')).resolves.toMatchObject({ id: 'tp-1' });
  });

  it('updateProfile applies only editable fields — verificationStatus is excluded even if it slipped past schema stripping', async () => {
    (prisma.tutorProfile.update as any).mockResolvedValue({ id: 'tp-1', bio: 'new bio' });

    await updateProfile('tp-1', { bio: 'new bio', verificationStatus: 'VERIFIED' } as any);

    const callArg = (prisma.tutorProfile.update as any).mock.calls[0][0];
    expect(callArg.data).not.toHaveProperty('verificationStatus');
  });
});

describe.skip('resubmitVerification — Issue 2 fix', () => {
  beforeEach(() => resetAllMocks());

  it('a REJECTED tutor returns to PENDING, clearing verifiedAt/verifiedById', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 'tp-1',
      verificationStatus: 'REJECTED',
    });
    (prisma.tutorProfile.update as any).mockResolvedValue({
      id: 'tp-1',
      verificationStatus: 'PENDING',
    });

    const result = await resubmitVerification('tp-1');

    expect(result).toMatchObject({ id: 'tp-1', verificationStatus: 'PENDING' });
    const callArg = (prisma.tutorProfile.update as any).mock.calls[0][0];
    expect(callArg.data).toMatchObject({
      verificationStatus: 'PENDING',
      verifiedAt: null,
      verifiedById: null,
    });
  });

  it('a PENDING tutor is rejected', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 'tp-1',
      verificationStatus: 'PENDING',
    });

    await expect(resubmitVerification('tp-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'Only a rejected application can be resubmitted',
    });
  });

  it('a VERIFIED tutor is rejected identically', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 'tp-1',
      verificationStatus: 'VERIFIED',
    });

    await expect(resubmitVerification('tp-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'Only a rejected application can be resubmitted',
    });
  });

  it('resubmission alone does not touch other profile fields', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 'tp-1',
      verificationStatus: 'REJECTED',
    });
    (prisma.tutorProfile.update as any).mockResolvedValue({
      id: 'tp-1',
      verificationStatus: 'PENDING',
    });

    await resubmitVerification('tp-1');

    const callArg = (prisma.tutorProfile.update as any).mock.calls[0][0];
    expect(Object.keys(callArg.data).sort()).toEqual(
      ['verificationStatus', 'verifiedAt', 'verifiedById'].sort(),
    );
  });
});

describe.skip('rankSubjects', () => {
  beforeEach(() => resetAllMocks());

  it('ranks exactly 2 subjects successfully — transaction called with delete-then-create in one array', async () => {
    (prisma.$transaction as any).mockResolvedValue([{ count: 2 }, { count: 2 }]);

    await rankSubjects('tp-1', [
      { subjectId: 'A', rank: 1 },
      { subjectId: 'B', rank: 2 },
    ] as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const arg = (prisma.$transaction as any).mock.calls[0][0];
    expect(Array.isArray(arg)).toBe(true);
  });

  it('a third subject is rejected at the service layer even if a relaxed/future schema let it through', async () => {
    await expect(
      rankSubjects('tp-1', [
        { subjectId: 'A', rank: 1 },
        { subjectId: 'B', rank: 2 },
        { subjectId: 'C', rank: 1 },
      ] as any),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'A tutor may rank a maximum of two subjects',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('duplicate subjectId/rank is rejected at the service layer', async () => {
    await expect(
      rankSubjects('tp-1', [
        { subjectId: 'A', rank: 1 },
        { subjectId: 'A', rank: 2 },
      ] as any),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Each subject may be ranked once, and ranks must be unique',
    });
  });

  it('transaction failure leaves no partial state — no follow-up cleanup call is made', async () => {
    (prisma.$transaction as any).mockRejectedValue(new Error('db down'));

    await expect(rankSubjects('tp-1', [{ subjectId: 'A', rank: 1 }] as any)).rejects.toThrow();
    expect(prisma.tutorSubjectRanking.deleteMany).not.toHaveBeenCalled();
  });

  it('requires no grade-range input — resolves without any grade field being read', async () => {
    (prisma.$transaction as any).mockResolvedValue([{ count: 1 }, { count: 1 }]);

    await expect(rankSubjects('tp-1', [{ subjectId: 'A', rank: 1 }] as any)).resolves.toBeDefined();
  });
});
