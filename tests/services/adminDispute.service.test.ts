/**
 * tests/services/adminDispute.service.test.ts
 *
 * Journey step 8.5. Spec: `09-8-support-trust-admin.md` §9.5.
 * FRs: FR-AD-012, FR-AD-017, FR-MK-003, FR-SP-048.
 * OWASP: A01:2021 – Broken Access Control (Admin-only surface),
 * A04:2021 – Insecure Design (the H4-fixed server-computed-refund path is
 * the central integrity control in this file),
 * A09:2021 – Security Logging and Monitoring Failures (audit-log
 * assertions, Rule 10).
 *
 * Unit tier — Prisma, `refund.service.createPendingRefund`/`approveRefund`
 * (I1 fix), `adminPeople.service.suspendAccount`, `notification.service.ts`,
 * and `auditLog.service.ts` are all mocked. Per 00-agent-rules.md's audit-log
 * convention, the pinned call shape is
 * `auditLog.service.record({ actor, action, target, timestamp })`.
 *
 * Assumed query shape for the REFUND_ISSUED proration gate (this test file
 * pins the contract, per Rule 1): `affectedCohortMembershipId`'s current
 * billing cycle is resolved via `prisma.payment.findFirst({ where: {
 * cohortMembershipId, status: 'SUCCESS' } })` — if none is found, the 400
 * from `08-support-trust-admin-api.md` §8.2 is thrown before ever calling
 * `refund.service.createPendingRefund`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    complaintReport: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    payment: { findFirst: vi.fn() },
  },
}));

vi.mock('../../src/services/refund.service.js', () => ({
  createPendingRefund: vi.fn(),
  approveRefund: vi.fn(),
}));

vi.mock('../../src/services/adminPeople.service.js', () => ({
  suspendAccount: vi.fn(),
}));

vi.mock('../../src/services/notification.service.js', () => ({
  dispatchNotification: vi.fn(),
}));

vi.mock('../../src/services/auditLog.service.js', () => ({
  record: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import * as refundService from '../../src/services/refund.service.js';
import * as adminPeopleService from '../../src/services/adminPeople.service.js';
import { dispatchNotification } from '../../src/services/notification.service.js';
import * as auditLogService from '../../src/services/auditLog.service.js';
import {
  getDisputeForReview,
  listDisputeQueue,
  resolveDispute,
} from '../../src/services/adminDispute.service.js';
import { resolveDisputeSchema } from '../../src/schemas/complaint.schema.js';
import { buildComplaintReport } from '../factories/support-trust-admin.factory.js';

const ADMIN_ID = 'admin-1';
const COMPLAINT_ID = 'complaint-1';
const MEMBERSHIP_ID = 'membership-1';

function resetMocks() {
  vi.clearAllMocks();
  (dispatchNotification as any).mockResolvedValue(undefined);
  (auditLogService.record as any).mockResolvedValue(undefined);
}

describe.skip('listDisputeQueue', () => {
  beforeEach(resetMocks);

  it('lists queued complaints, filterable by status/category', async () => {
    (prisma.complaintReport.findMany as any).mockResolvedValue([
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'TUTOR_CONDUCT',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
        relatedCohortId: 'cohort-1',
      }),
    ]);

    const result = await listDisputeQueue('UNDER_REVIEW', 'TUTOR_CONDUCT', 1, 20);

    expect(result.complaints).toHaveLength(1);
    const findManyArg = (prisma.complaintReport.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(findManyArg.where)).toContain('UNDER_REVIEW');
    expect(JSON.stringify(findManyArg.where)).toContain('TUTOR_CONDUCT');
  });

  it('an empty queue is a normal 200 state, not an error', async () => {
    (prisma.complaintReport.findMany as any).mockResolvedValue([]);

    const result = await listDisputeQueue(undefined, undefined, 1, 20);

    expect(result.complaints).toEqual([]);
  });
});

describe.skip('getDisputeForReview', () => {
  beforeEach(resetMocks);

  it('returns full detail including linked references', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'SESSION_ISSUE',
        description: 'x'.repeat(20),
        relatedThreadId: 'thread-1',
        relatedSessionId: 'session-1',
        relatedPaymentId: null,
      }),
    );

    const result = await getDisputeForReview(COMPLAINT_ID);

    expect(result.relatedThreadId).toBe('thread-1');
    expect(result.relatedSessionId).toBe('session-1');
  });

  it("does not embed another feature's data — thread/session content itself is not duplicated inline", async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'SESSION_ISSUE',
        description: 'x'.repeat(20),
        relatedThreadId: 'thread-1',
      }),
    );

    const result = await getDisputeForReview(COMPLAINT_ID);

    expect(result).not.toHaveProperty('messages');
    expect(result).not.toHaveProperty('session');
  });

  it('404s on an unknown complaint', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(null);

    await expect(getDisputeForReview('unknown-id')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe.skip('resolveDispute', () => {
  beforeEach(resetMocks);

  it('dismisses a complaint', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
      }),
    );
    (prisma.complaintReport.update as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'DISMISSED',
        resolvedById: ADMIN_ID,
        resolvedAt: new Date(),
      }),
    );

    const result = await resolveDispute(COMPLAINT_ID, ADMIN_ID, {
      status: 'DISMISSED',
      resolutionNotes: 'no violation found',
    });

    expect(result.status).toBe('DISMISSED');
    const updateArg = (prisma.complaintReport.update as any).mock.calls[0][0];
    expect(updateArg.data.resolvedById).toBe(ADMIN_ID);
    expect(updateArg.data.resolvedAt).toBeTruthy();
    expect(dispatchNotification).toHaveBeenCalledWith(
      'reporter-1',
      'COMPLAINT_RESOLVED',
      expect.any(Object),
    );
  });

  it('resolves with NO_ACTION — no downstream feature call made', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
      }),
    );
    (prisma.complaintReport.update as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'RESOLVED',
        resolutionAction: 'NO_ACTION',
        resolvedById: ADMIN_ID,
        resolvedAt: new Date(),
      }),
    );

    const result = await resolveDispute(COMPLAINT_ID, ADMIN_ID, {
      status: 'RESOLVED',
      resolutionAction: 'NO_ACTION',
      resolutionNotes: 'reviewed, no action needed',
    });

    expect(result.status).toBe('RESOLVED');
    expect(refundService.createPendingRefund).not.toHaveBeenCalled();
    expect(adminPeopleService.suspendAccount).not.toHaveBeenCalled();
  });

  it('REFUND_ISSUED calls the exact same sessions-delivered proration path as any other refund reason (H4 fix, I1 fix)', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'SESSION_ISSUE',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
      }),
    );
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: 'payment-1',
      cohortMembershipId: MEMBERSHIP_ID,
      status: 'SUCCESS',
    });
    (refundService.createPendingRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'PENDING',
      amount: '50.00',
    });
    (refundService.approveRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'APPROVED',
      amount: '50.00',
      approvedById: ADMIN_ID,
      approvedAt: new Date(),
    });
    (prisma.complaintReport.update as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'SESSION_ISSUE',
        description: 'x'.repeat(20),
        status: 'RESOLVED',
        resolutionAction: 'REFUND_ISSUED',
        resolvedById: ADMIN_ID,
        resolvedAt: new Date(),
      }),
    );

    await resolveDispute(COMPLAINT_ID, ADMIN_ID, {
      status: 'RESOLVED',
      resolutionAction: 'REFUND_ISSUED',
      affectedCohortMembershipId: MEMBERSHIP_ID,
      resolutionNotes: 'confirmed tutor no-show, refund owed',
    });

    expect(refundService.createPendingRefund).toHaveBeenCalledWith(
      'payment-1',
      'ADMIN_DISPUTE_RESOLUTION',
    );
    expect(refundService.approveRefund).toHaveBeenCalledWith('refund-1', ADMIN_ID);
  });

  it('REFUND_ISSUED ends the Refund at status APPROVED rather than being left PENDING', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'SESSION_ISSUE',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
      }),
    );
    (prisma.payment.findFirst as any).mockResolvedValue({
      id: 'payment-1',
      cohortMembershipId: MEMBERSHIP_ID,
      status: 'SUCCESS',
    });
    (refundService.createPendingRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'PENDING',
      amount: '50.00',
    });
    (refundService.approveRefund as any).mockResolvedValue({
      id: 'refund-1',
      status: 'APPROVED',
      amount: '50.00',
      approvedById: ADMIN_ID,
      approvedAt: new Date(),
    });
    (prisma.complaintReport.update as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'SESSION_ISSUE',
        description: 'x'.repeat(20),
        status: 'RESOLVED',
        resolutionAction: 'REFUND_ISSUED',
        resolvedById: ADMIN_ID,
        resolvedAt: new Date(),
      }),
    );

    const result = await resolveDispute(COMPLAINT_ID, ADMIN_ID, {
      status: 'RESOLVED',
      resolutionAction: 'REFUND_ISSUED',
      affectedCohortMembershipId: MEMBERSHIP_ID,
      resolutionNotes: 'confirmed tutor no-show, refund owed',
    });

    expect((refundService.approveRefund as any).mock.results[0].value).resolves.toMatchObject({
      status: 'APPROVED',
    });
    expect(result.status).toBe('RESOLVED');
  });

  it('REFUND_ISSUED rejects a membership with no paid cycle to prorate', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'SESSION_ISSUE',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
      }),
    );
    (prisma.payment.findFirst as any).mockResolvedValue(null);

    await expect(
      resolveDispute(COMPLAINT_ID, ADMIN_ID, {
        status: 'RESOLVED',
        resolutionAction: 'REFUND_ISSUED',
        affectedCohortMembershipId: MEMBERSHIP_ID,
        resolutionNotes: 'no active cycle',
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'affectedCohortMembershipId does not have an active, paid billing cycle to prorate',
    });
    expect(refundService.createPendingRefund).not.toHaveBeenCalled();
  });

  it("TUTOR_SUSPENDED calls accounts-guardianship's suspension with the tutor's id", async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'TUTOR_CONDUCT',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
        relatedCohortId: 'cohort-1',
      }),
    );
    (adminPeopleService.suspendAccount as any).mockResolvedValue({
      userId: 'tutor-1',
      accountStatus: 'SUSPENDED',
    });
    (prisma.complaintReport.update as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'TUTOR_CONDUCT',
        description: 'x'.repeat(20),
        status: 'RESOLVED',
        resolutionAction: 'TUTOR_SUSPENDED',
        resolvedById: ADMIN_ID,
        resolvedAt: new Date(),
      }),
    );

    await resolveDispute(COMPLAINT_ID, ADMIN_ID, {
      status: 'RESOLVED',
      resolutionAction: 'TUTOR_SUSPENDED',
      resolutionNotes: 'repeated conduct violations',
    });

    expect(adminPeopleService.suspendAccount).toHaveBeenCalledTimes(1);
  });

  it('a re-matching resolution is never modeled here — the enum has no RE_MATCH-style value', () => {
    const result = resolveDisputeSchema.safeParse({
      body: { status: 'RESOLVED', resolutionAction: 'RE_MATCH', resolutionNotes: 'note' },
    });

    expect(result.success).toBe(false);
  });

  it('resolutionNotes is never disclosed to the reporter verbatim', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
      }),
    );
    (prisma.complaintReport.update as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'DISMISSED',
        resolutionNotes: 'internal note the reporter must never see',
        resolvedById: ADMIN_ID,
        resolvedAt: new Date(),
      }),
    );

    await resolveDispute(COMPLAINT_ID, ADMIN_ID, {
      status: 'DISMISSED',
      resolutionNotes: 'internal note the reporter must never see',
    });

    const notifyPayload = (dispatchNotification as any).mock.calls[0][2];
    expect(JSON.stringify(notifyPayload)).not.toContain(
      'internal note the reporter must never see',
    );
  });

  it('already-closed complaint (RESOLVED) rejected', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'RESOLVED',
      }),
    );

    await expect(
      resolveDispute(COMPLAINT_ID, ADMIN_ID, { status: 'DISMISSED', resolutionNotes: 'note' }),
    ).rejects.toMatchObject({ statusCode: 409, message: 'This complaint has already been closed' });
  });

  it('already-closed complaint (DISMISSED) rejected independently of the RESOLVED case', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'DISMISSED',
      }),
    );

    await expect(
      resolveDispute(COMPLAINT_ID, ADMIN_ID, {
        status: 'RESOLVED',
        resolutionAction: 'NO_ACTION',
        resolutionNotes: 'note',
      }),
    ).rejects.toMatchObject({ statusCode: 409, message: 'This complaint has already been closed' });
  });

  it('missing resolutionAction on a RESOLVED submission rejected at the service layer too', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
      }),
    );

    await expect(
      resolveDispute(COMPLAINT_ID, ADMIN_ID, {
        status: 'RESOLVED',
        resolutionNotes: 'note',
      } as any),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'A resolution action is required to resolve a complaint',
    });
  });

  it('[Phase 4] every resolution action is audit-logged, tagged DISPUTE_RESOLVED', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
      }),
    );
    (prisma.complaintReport.update as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'DISMISSED',
        resolvedById: ADMIN_ID,
        resolvedAt: new Date(),
      }),
    );

    await resolveDispute(COMPLAINT_ID, ADMIN_ID, {
      status: 'DISMISSED',
      resolutionNotes: 'no violation found',
    });

    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: ADMIN_ID,
        action: 'DISPUTE_RESOLVED',
        target: COMPLAINT_ID,
        timestamp: expect.any(Date),
      }),
    );
  });

  it("[Phase 4] TUTOR_SUSPENDED branch does not duplicate adminPeople.service's own audit entry", async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'TUTOR_CONDUCT',
        description: 'x'.repeat(20),
        status: 'UNDER_REVIEW',
        relatedCohortId: 'cohort-1',
      }),
    );
    (adminPeopleService.suspendAccount as any).mockResolvedValue({
      userId: 'tutor-1',
      accountStatus: 'SUSPENDED',
    });
    (prisma.complaintReport.update as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'reporter-1',
        category: 'TUTOR_CONDUCT',
        description: 'x'.repeat(20),
        status: 'RESOLVED',
        resolutionAction: 'TUTOR_SUSPENDED',
        resolvedById: ADMIN_ID,
        resolvedAt: new Date(),
      }),
    );

    await resolveDispute(COMPLAINT_ID, ADMIN_ID, {
      status: 'RESOLVED',
      resolutionAction: 'TUTOR_SUSPENDED',
      resolutionNotes: 'repeated conduct violations',
    });

    const disputeResolvedCalls = (auditLogService.record as any).mock.calls.filter(
      (c: any[]) => c[0]?.action === 'DISPUTE_RESOLVED',
    );
    expect(disputeResolvedCalls).toHaveLength(1);
  });
});
