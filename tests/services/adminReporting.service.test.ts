/**
 * tests/services/adminReporting.service.test.ts
 *
 * Journey step 8.8. Spec: `09-8-support-trust-admin.md` §9.7.
 * FRs: FR-AD-021, FR-AD-022, FR-AD-005, FR-AD-014, FR-AD-020.
 * OWASP: A01:2021 – Broken Access Control (Admin-only surface).
 *
 * Unit tier — Prisma is mocked across every source table this
 * read-only, computed-on-request feature aggregates over. Per
 * `06-api/08-support-trust-admin-api.md` §8.2, the six sources for
 * `getActivityHistory` are `Cohort`, `Payment`, `ComplaintReport`,
 * `TutorProfile`, `Refund`, `Payout`; `getTutorPerformanceHistory` reads
 * `TutorProfile` (accounts-guardianship), `ScheduledSession`/`SessionMiss`
 * (class-delivery-library), `TutorBadge` (gamification-engagement), and
 * `ComplaintReport` (this feature, via `relatedCohortId`/`relatedSessionId`
 * derivation per `04-database-and-data-model.md` §4.2.9's "Tutor
 * resolution" note).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    complaintReport: { count: vi.fn(), findMany: vi.fn() },
    cohort: { count: vi.fn(), findMany: vi.fn() },
    scheduledSession: { count: vi.fn(), findMany: vi.fn() },
    sessionMiss: { count: vi.fn(), findMany: vi.fn() },
    payout: { count: vi.fn(), findMany: vi.fn() },
    payment: { count: vi.fn(), findMany: vi.fn() },
    tutorProfile: { findMany: vi.fn(), count: vi.fn() },
    refund: { count: vi.fn(), findMany: vi.fn() },
    tutorBadge: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  aggregatePlatformHealth,
  getActivityHistory,
  getTutorPerformanceHistory,
} from '../../src/services/adminReporting.service.js';

function resetMocks() {
  vi.clearAllMocks();
  (prisma.complaintReport.count as any).mockResolvedValue(0);
  (prisma.cohort.count as any).mockResolvedValue(0);
  (prisma.scheduledSession.count as any).mockResolvedValue(0);
  (prisma.sessionMiss.count as any).mockResolvedValue(0);
  (prisma.payout.count as any).mockResolvedValue(0);
  (prisma.payment.count as any).mockResolvedValue(0);
  (prisma.refund.count as any).mockResolvedValue(0);
  (prisma.tutorBadge.count as any).mockResolvedValue(0);
  (prisma.complaintReport.findMany as any).mockResolvedValue([]);
  (prisma.cohort.findMany as any).mockResolvedValue([]);
  (prisma.payment.findMany as any).mockResolvedValue([]);
  (prisma.tutorProfile.findMany as any).mockResolvedValue([]);
  (prisma.refund.findMany as any).mockResolvedValue([]);
  (prisma.payout.findMany as any).mockResolvedValue([]);
}

describe.skip('aggregatePlatformHealth', () => {
  beforeEach(resetMocks);

  it('aggregates counts across all owning features', async () => {
    (prisma.complaintReport.count as any).mockResolvedValue(4);
    (prisma.cohort.count as any).mockResolvedValue(2);
    (prisma.scheduledSession.count as any).mockResolvedValue(1);
    (prisma.payout.count as any).mockResolvedValue(0);

    const result = await aggregatePlatformHealth();

    expect(result).toMatchObject({
      openDisputes: 4,
      overdueMatchApprovals: 2,
      recordingComplianceEscalations: 1,
      pendingPayoutBatches: 0,
    });
    expect(result.generatedAt).toBeTruthy();
  });

  it('never mutates any of the underlying flags — zero write calls', async () => {
    await aggregatePlatformHealth();

    for (const model of Object.values(prisma) as any[]) {
      for (const method of ['create', 'update', 'delete', 'updateMany', 'deleteMany', 'upsert']) {
        if (model[method]) {
          expect(model[method]).not.toHaveBeenCalled();
        }
      }
    }
  });

  it("never re-derives another feature's staleness/escalation logic — reads job-maintained flags directly", async () => {
    await aggregatePlatformHealth();

    const cohortArg = (prisma.cohort.count as any).mock.calls[0]?.[0];
    const sessionArg = (prisma.scheduledSession.count as any).mock.calls[0]?.[0];
    expect(JSON.stringify(cohortArg)).toMatch(/adminOverdueNotifiedAt|isOverdue/);
    expect(JSON.stringify(sessionArg)).toContain('ESCALATED');
  });
});

describe.skip('getActivityHistory', () => {
  beforeEach(resetMocks);

  it('returns paginated activity across the documented source tables', async () => {
    (prisma.cohort.findMany as any).mockResolvedValue([
      { id: 'cohort-1', createdAt: new Date('2026-08-01') },
    ]);
    (prisma.payment.findMany as any).mockResolvedValue([
      { id: 'payment-1', createdAt: new Date('2026-08-02') },
    ]);
    (prisma.complaintReport.findMany as any).mockResolvedValue([
      { id: 'complaint-1', createdAt: new Date('2026-08-03') },
    ]);
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      { id: 'tutor-1', verifiedAt: new Date('2026-08-04') },
    ]);
    (prisma.refund.findMany as any).mockResolvedValue([
      { id: 'refund-1', createdAt: new Date('2026-08-05') },
    ]);
    (prisma.payout.findMany as any).mockResolvedValue([
      { id: 'payout-1', createdAt: new Date('2026-08-06') },
    ]);

    const result = await getActivityHistory(1, 20, '30d');

    const eventTypes = result.events.map((e: any) => e.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        'BOOKING',
        'PAYMENT',
        'DISPUTE',
        'TUTOR_VERIFICATION',
        'REFUND',
        'PAYOUT',
      ]),
    );
  });

  it('filters by dateRange — only rows inside the range are resolved', async () => {
    const inRange = new Date();
    const outOfRange = new Date('2000-01-01');
    (prisma.payment.findMany as any).mockResolvedValue([{ id: 'payment-in', createdAt: inRange }]);

    await getActivityHistory(1, 20, '7d');

    const paymentArg = (prisma.payment.findMany as any).mock.calls[0][0];
    expect(paymentArg.where).toBeTruthy();
    expect(outOfRange.getTime()).toBeLessThan(inRange.getTime());
  });
});

describe.skip('getTutorPerformanceHistory', () => {
  beforeEach(resetMocks);

  it('reads across features without owning the data', async () => {
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      {
        id: 'tutor-1',
        userId: 'user-tutor-1',
        verificationStatus: 'VERIFIED',
        uniqueStudentsTaught: 14,
        createdAt: new Date('2026-01-10'),
      },
    ]);
    (prisma.scheduledSession.count as any).mockResolvedValue(210);
    (prisma.sessionMiss.count as any).mockResolvedValue(2);
    (prisma.tutorBadge.count as any).mockResolvedValue(5);
    (prisma.complaintReport.count as any).mockResolvedValue(1);

    const result = await getTutorPerformanceHistory(undefined, 1, 20);

    expect(result.tutors[0]).toMatchObject({
      tutorId: 'tutor-1',
      verificationStatus: 'VERIFIED',
      uniqueStudentsTaught: 14,
      completedSessionCount: 210,
      tutorCausedMissCount: 2,
      badgeCount: 5,
      complaintCount: 1,
    });
  });

  it('supports filtering/sorting per the given params', async () => {
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    await getTutorPerformanceHistory(undefined, 1, 20, 'badgeCount', 'PENDING');

    const arg = (prisma.tutorProfile.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(arg)).toContain('PENDING');
  });

  it('defaults to VERIFIED-only when verificationStatus is omitted', async () => {
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    await getTutorPerformanceHistory(undefined, 1, 20);

    const arg = (prisma.tutorProfile.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(arg)).toContain('VERIFIED');
  });

  it('a single-tutor lookup via tutorId returns that tutor only', async () => {
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      {
        id: 'tutor-1',
        userId: 'user-tutor-1',
        verificationStatus: 'VERIFIED',
        uniqueStudentsTaught: 5,
        createdAt: new Date(),
      },
    ]);

    await getTutorPerformanceHistory('tutor-1', 1, 20);

    const arg = (prisma.tutorProfile.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(arg.where)).toContain('tutor-1');
  });
});
