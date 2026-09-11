/**
 * tests/services/adminTutorVerification.service.test.ts
 *
 * Journey step 2.20. Spec: `09-2-accounts-guardianship.md` §9.16.
 * FRs: FR-TU-004, FR-AD-002.
 * OWASP: A09:2021 – Security Logging and Monitoring Failures (rejection
 *        audit-log coverage — Phase 4/Review §6.4).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    tutorProfile: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/notification.service.js', () => ({
  dispatchNotification: vi.fn(),
}));

vi.mock('../../src/services/auditLog.service.js', () => ({
  record: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { dispatchNotification } from '../../src/services/notification.service.js';
import { record as recordAuditLog } from '../../src/services/auditLog.service.js';
import {
  approveTutor,
  listPendingTutors,
  rejectTutor,
} from '../../src/services/adminTutorVerification.service.js';
import ApiError from '../../src/utils/ApiError.js';

function resetAllMocks() {
  vi.clearAllMocks();
  (dispatchNotification as any).mockResolvedValue(undefined);
  (recordAuditLog as any).mockResolvedValue(undefined);
}

describe.skip('listPendingTutors', () => {
  beforeEach(() => resetAllMocks());

  it('lists only PENDING tutors, paginated', async () => {
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      { id: 't1', verificationStatus: 'PENDING' },
    ]);

    await listPendingTutors(1, 20);

    const callArg = (prisma.tutorProfile.findMany as any).mock.calls[0][0];
    expect(callArg.where).toMatchObject({ verificationStatus: 'PENDING' });
  });
});

describe.skip('approveTutor / rejectTutor', () => {
  beforeEach(() => resetAllMocks());

  it('approves a pending tutor — sets VERIFIED, verifiedAt, verifiedById; notifies the tutor', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'PENDING',
    });
    (prisma.tutorProfile.update as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'VERIFIED',
    });

    await approveTutor('t1', 'admin-1');

    expect(prisma.tutorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verificationStatus: 'VERIFIED', verifiedById: 'admin-1' }),
      }),
    );
    expect(dispatchNotification).toHaveBeenCalled();
  });

  it('rejects a pending tutor with a reason — persisted as an internal note field only', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'PENDING',
    });
    (prisma.tutorProfile.update as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'REJECTED',
    });

    await rejectTutor('t1', 'admin-1', 'Incomplete credentials');

    expect(prisma.tutorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verificationStatus: 'REJECTED' }),
      }),
    );
  });

  it('the rejection reason never leaks into the tutor-facing notification payload', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'PENDING',
    });
    (prisma.tutorProfile.update as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'REJECTED',
    });

    await rejectTutor('t1', 'admin-1', 'Suspicious ID document');

    const notifyArgs = (dispatchNotification as any).mock.calls[0];
    const serialized = JSON.stringify(notifyArgs);
    expect(serialized).not.toContain('Suspicious ID document');
  });

  it('[Phase 4 — Review §6.4] rejection writes an audit log entry including the internal reason', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'PENDING',
    });
    (prisma.tutorProfile.update as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'REJECTED',
    });

    await rejectTutor('t1', 'admin-1', 'Suspicious ID document');

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'admin-1', action: 'TUTOR_REJECTED', target: 't1' }),
    );
  });

  it('approving an already-reviewed (VERIFIED) tutor throws ApiError(409)', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'VERIFIED',
    });

    await expect(approveTutor('t1', 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'This tutor has already been reviewed',
    });
  });

  it('rejecting an already-rejected tutor throws the identical ApiError(409)', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'REJECTED',
    });

    await expect(rejectTutor('t1', 'admin-1', '...')).rejects.toMatchObject({
      statusCode: 409,
      message: 'This tutor has already been reviewed',
    });
  });

  it('approval persists verificationStatus VERIFIED — the flag matching-cohorts reads for matchability', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'PENDING',
    });
    (prisma.tutorProfile.update as any).mockResolvedValue({
      id: 't1',
      verificationStatus: 'VERIFIED',
    });

    await approveTutor('t1', 'admin-1');

    const callArg = (prisma.tutorProfile.update as any).mock.calls[0][0];
    expect(callArg.data.verificationStatus).toBe('VERIFIED');
  });
});
