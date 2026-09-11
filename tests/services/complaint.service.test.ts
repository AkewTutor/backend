/**
 * tests/services/complaint.service.test.ts
 *
 * Journey step 8.2. Spec: `09-8-support-trust-admin.md` §9.3.
 * FRs: FR-AD-017, FR-MS-004 (linkage), FR-PB-006. NFRs: NFR-009.
 * OWASP: A01:2021 – Broken Access Control (ownership check on
 * createComplaint, reporter-only visibility on reads).
 *
 * Unit tier — Prisma (`src/config/db.ts`) and `notification.service.ts`
 * are mocked; nothing here touches a real database or the real
 * notification pipeline.
 *
 * Assumed ownership-check query shape (this test file pins the contract,
 * per Rule 1 — no `complaint.service.ts` exists yet to read it from):
 * a `relatedSessionId` is resolved via `prisma.scheduledSession.findUnique`
 * (with its owning `Cohort`'s memberships/tutorId), a `relatedCohortId` via
 * `prisma.cohort.findUnique` the same way, and a `relatedPaymentId` via
 * `prisma.payment.findUnique` (with its `cohortMembership`). Ownership
 * passes if the reporter is a member (`CohortMembership.studentId`) or the
 * cohort's `tutorId`. `relatedThreadId` auto-resolves via
 * `prisma.messageThread.findFirst({ where: { cohortId } })`. The Admin
 * queue notification target is the first `User` with `role: 'ADMIN'`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    complaintReport: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
    },
    scheduledSession: { findUnique: vi.fn() },
    cohort: { findUnique: vi.fn() },
    payment: { findUnique: vi.fn() },
    messageThread: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

vi.mock('../../src/services/notification.service.js', () => ({
  dispatchNotification: vi.fn(),
}));

vi.mock('../../src/services/messaging.service.js', () => ({
  closeThread: vi.fn(),
  muteThread: vi.fn(),
}));

vi.mock('../../src/services/session.service.js', () => ({
  cancelSession: vi.fn(),
  rescheduleSession: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { dispatchNotification } from '../../src/services/notification.service.js';
import * as messagingService from '../../src/services/messaging.service.js';
import * as sessionService from '../../src/services/session.service.js';
import {
  createComplaint,
  getForReporter,
  getSupportContactInfo,
  listForUser,
} from '../../src/services/complaint.service.js';
import { buildComplaintReport } from '../factories/support-trust-admin.factory.js';

const REPORTER_ID = 'reporter-1';
const SESSION_ID = 'session-1';
const COHORT_ID = 'cohort-1';

function resetMocks() {
  vi.clearAllMocks();
  (dispatchNotification as any).mockResolvedValue(undefined);
  (prisma.user.findFirst as any).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
}

describe.skip('createComplaint', () => {
  beforeEach(resetMocks);

  it("files a complaint referencing the caller's own session", async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      cohort: { tutorId: 'tutor-1', memberships: [{ studentId: REPORTER_ID }] },
    });
    (prisma.messageThread.findFirst as any).mockResolvedValue(null);
    (prisma.complaintReport.create as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: REPORTER_ID,
        category: 'SESSION_ISSUE',
        description: 'Tutor never joined.',
        relatedSessionId: SESSION_ID,
      }),
    );

    const result = await createComplaint(REPORTER_ID, 'STUDENT', {
      category: 'SESSION_ISSUE',
      description: 'Tutor never joined.',
      relatedSessionId: SESSION_ID,
    });

    expect(result.id).toBeTruthy();
    expect(result.status).toBe('OPEN');
  });

  it("rejects a reference to another user's resource (IDOR)", async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      cohort: { tutorId: 'some-other-tutor', memberships: [{ studentId: 'some-other-student' }] },
    });

    await expect(
      createComplaint(REPORTER_ID, 'STUDENT', {
        category: 'SESSION_ISSUE',
        description: 'Not my session at all.',
        relatedSessionId: SESSION_ID,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'You can only file a complaint about your own sessions, payments, or cohorts',
    });
  });

  it('auto-resolves relatedThreadId from the cohort/session', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      cohort: { tutorId: 'tutor-1', memberships: [{ studentId: REPORTER_ID }] },
    });
    (prisma.messageThread.findFirst as any).mockResolvedValue({
      id: 'thread-1',
      cohortId: COHORT_ID,
    });
    (prisma.complaintReport.create as any).mockImplementation(async ({ data }: any) =>
      buildComplaintReport({
        reporterId: data.reporterId,
        category: data.category,
        description: data.description,
        relatedSessionId: data.relatedSessionId,
        relatedThreadId: data.relatedThreadId,
      }),
    );

    await createComplaint(REPORTER_ID, 'STUDENT', {
      category: 'SESSION_ISSUE',
      description: 'Tutor was rude in class.',
      relatedSessionId: SESSION_ID,
    });

    const createArg = (prisma.complaintReport.create as any).mock.calls[0][0];
    expect(createArg.data.relatedThreadId).toBe('thread-1');
  });

  it('leaves relatedThreadId null when no thread exists for the reference', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      cohort: { tutorId: 'tutor-1', memberships: [{ studentId: REPORTER_ID }] },
    });
    (prisma.messageThread.findFirst as any).mockResolvedValue(null);
    (prisma.complaintReport.create as any).mockImplementation(async ({ data }: any) =>
      buildComplaintReport({
        reporterId: data.reporterId,
        category: data.category,
        description: data.description,
        relatedSessionId: data.relatedSessionId,
        relatedThreadId: data.relatedThreadId ?? null,
      }),
    );

    const result = await createComplaint(REPORTER_ID, 'STUDENT', {
      category: 'SESSION_ISSUE',
      description: 'A 1-to-1 that never exchanged messages.',
      relatedSessionId: SESSION_ID,
    });

    expect(result.relatedThreadId ?? null).toBeNull();
  });

  it('notifies the Admin queue', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      cohort: { tutorId: 'tutor-1', memberships: [{ studentId: REPORTER_ID }] },
    });
    (prisma.messageThread.findFirst as any).mockResolvedValue(null);
    (prisma.complaintReport.create as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: REPORTER_ID,
        category: 'SESSION_ISSUE',
        description: 'Tutor never joined.',
        relatedSessionId: SESSION_ID,
      }),
    );

    await createComplaint(REPORTER_ID, 'STUDENT', {
      category: 'SESSION_ISSUE',
      description: 'Tutor never joined.',
      relatedSessionId: SESSION_ID,
    });

    expect(dispatchNotification).toHaveBeenCalledTimes(1);
    expect(dispatchNotification).toHaveBeenCalledWith(
      'admin-1',
      'ADMIN_REVIEW_REQUIRED',
      expect.any(Object),
    );
  });

  it('never affects the referenced thread/session itself', async () => {
    (prisma.scheduledSession.findUnique as any).mockResolvedValue({
      id: SESSION_ID,
      cohortId: COHORT_ID,
      cohort: { tutorId: 'tutor-1', memberships: [{ studentId: REPORTER_ID }] },
    });
    (prisma.messageThread.findFirst as any).mockResolvedValue({
      id: 'thread-1',
      cohortId: COHORT_ID,
    });
    (prisma.complaintReport.create as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: REPORTER_ID,
        category: 'SESSION_ISSUE',
        description: 'Tutor never joined.',
        relatedSessionId: SESSION_ID,
      }),
    );

    await createComplaint(REPORTER_ID, 'STUDENT', {
      category: 'SESSION_ISSUE',
      description: 'Tutor never joined.',
      relatedSessionId: SESSION_ID,
    });

    expect(messagingService.closeThread).not.toHaveBeenCalled();
    expect(messagingService.muteThread).not.toHaveBeenCalled();
    expect(sessionService.cancelSession).not.toHaveBeenCalled();
    expect(sessionService.rescheduleSession).not.toHaveBeenCalled();
  });

  it('OTHER category with no related entity resolves successfully', async () => {
    (prisma.complaintReport.create as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: REPORTER_ID,
        category: 'OTHER',
        description: 'General feedback, nothing specific to link.',
      }),
    );

    const result = await createComplaint(REPORTER_ID, 'STUDENT', {
      category: 'OTHER',
      description: 'General feedback, nothing specific to link.',
    });

    expect(result.category).toBe('OTHER');
    expect(prisma.scheduledSession.findUnique).not.toHaveBeenCalled();
  });
});

describe.skip('listForUser', () => {
  beforeEach(resetMocks);

  it("lists the caller's own complaints, paginated", async () => {
    (prisma.complaintReport.findMany as any).mockResolvedValue([
      buildComplaintReport({
        reporterId: REPORTER_ID,
        category: 'OTHER',
        description: 'x'.repeat(20),
      }),
    ]);
    (prisma.complaintReport.count as any).mockResolvedValue(1);

    const result = await listForUser(REPORTER_ID, undefined, 1, 20);

    expect(result.total).toBe(1);
    expect(result.complaints).toHaveLength(1);
    const findManyArg = (prisma.complaintReport.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(findManyArg.where)).toContain(REPORTER_ID);
  });

  it('no complaints yet resolves { complaints: [], page, limit, total: 0 }, not an error', async () => {
    (prisma.complaintReport.findMany as any).mockResolvedValue([]);
    (prisma.complaintReport.count as any).mockResolvedValue(0);

    const result = await listForUser(REPORTER_ID, undefined, 1, 20);

    expect(result).toMatchObject({ complaints: [], page: 1, limit: 20, total: 0 });
  });

  it('filters by status', async () => {
    (prisma.complaintReport.findMany as any).mockResolvedValue([
      buildComplaintReport({
        reporterId: REPORTER_ID,
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'RESOLVED',
      }),
    ]);
    (prisma.complaintReport.count as any).mockResolvedValue(1);

    await listForUser(REPORTER_ID, 'RESOLVED', 1, 20);

    const findManyArg = (prisma.complaintReport.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(findManyArg.where)).toContain('RESOLVED');
  });
});

describe.skip('getForReporter', () => {
  beforeEach(resetMocks);

  it("returns the reporter's own complaint", async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: REPORTER_ID,
        category: 'OTHER',
        description: 'x'.repeat(20),
      }),
    );

    const result = await getForReporter(REPORTER_ID, 'complaint-1');

    expect(result.reporterId).toBe(REPORTER_ID);
  });

  it('rejects a non-reporter caller (IDOR)', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: 'someone-else',
        category: 'OTHER',
        description: 'x'.repeat(20),
      }),
    );

    await expect(getForReporter(REPORTER_ID, 'complaint-1')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to view this complaint',
    });
  });

  it('404s on an unknown complaint', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(null);

    await expect(getForReporter(REPORTER_ID, 'unknown-id')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Complaint not found',
    });
  });

  it('never exposes internal resolution notes', async () => {
    (prisma.complaintReport.findUnique as any).mockResolvedValue(
      buildComplaintReport({
        reporterId: REPORTER_ID,
        category: 'OTHER',
        description: 'x'.repeat(20),
        status: 'RESOLVED',
        resolutionAction: 'NO_ACTION',
        resolutionNotes: 'Internal-only note about the decision.',
        resolvedById: 'admin-1',
      }),
    );

    const result = await getForReporter(REPORTER_ID, 'complaint-1');

    expect(Object.keys(result)).not.toContain('resolutionNotes');
    expect(Object.keys(result)).not.toContain('resolvedById');
  });
});

describe.skip('getSupportContactInfo', () => {
  beforeEach(resetMocks);

  it('is a static published read, the same regardless of caller', async () => {
    const first = await getSupportContactInfo();
    const second = await getSupportContactInfo();

    expect(first).toEqual(second);
    expect(first).toHaveProperty('phone');
    expect(first).toHaveProperty('telegramHandle');
    expect(first).toHaveProperty('hours');
  });
});
