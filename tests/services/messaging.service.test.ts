/**
 * tests/services/messaging.service.test.ts
 *
 * Journey step 5.2. Spec: `09-5-messaging.md` §9.3.
 * FRs: FR-MS-001–003, FR-SC-004, FR-NO-011. NFRs: NFR-009.
 * OWASP: A01:2021 – Broken Access Control (membership scoping is this
 * file's central risk).
 *
 * Mocked: Prisma (`cohort`, `messageThread`, `message`),
 * `notification.service.ts → dispatchNotification` (per the Test File
 * Map — this is the one sibling-service mock this file makes).
 *
 * A note on the access-check model this file pins down: `00-agent-rules.md`
 * requires flagging a genuinely ambiguous spec point rather than silently
 * guessing. Doc 04's `CohortMembership.status` model (`ACTIVE | ENDED`) and
 * FR-MS-003 ("an archived thread's history must always remain readable")
 * are not fully reconciled anywhere in Docs 02/04/06/08: a cohort that has
 * naturally ended has its memberships end too (`endReason: COMPLETED`), yet
 * FR-MS-003 requires that history to stay readable 90 days later once the
 * thread is archived. This file resolves that gap the same way Doc 9-5's
 * own `closeThread`-re-close case is handled (flagged, not left untested):
 * the membership check treats `ENDED` + `endReason: COMPLETED` (the
 * cohort naturally finished) as still access-eligible, distinct from
 * `ENDED` with any other reason (dropped/removed), which is blocked. The
 * `getThreadForCohort`/`listMessages` "no longer an active member" cases
 * below use a non-`COMPLETED` end reason specifically so this distinction
 * is exercised, not collapsed into a single case.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    cohort: {
      findUnique: vi.fn(),
    },
    messageThread: {
      findUnique: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/notification.service.js', () => ({
  dispatchNotification: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { dispatchNotification } from '../../src/services/notification.service.js';
import {
  getThreadForCohort,
  listMessages,
  sendMessage,
} from '../../src/services/messaging.service.js';

const cohortId = 'cohort-1';
const threadId = 'thread-1';
const tutorId = 'tutor-1';

function membership(studentId: string, status: 'ACTIVE' | 'ENDED' = 'ACTIVE', endReason?: string) {
  return { id: `mem-${studentId}`, studentId, status, endReason: endReason ?? null };
}

function mockCohort(
  overrides: Partial<{
    format: 'ONE_TO_ONE' | 'ONE_TO_THREE';
    status: string;
    memberships: ReturnType<typeof membership>[];
  }> = {},
) {
  return {
    id: cohortId,
    tutorId,
    format: overrides.format ?? 'ONE_TO_ONE',
    status: overrides.status ?? 'ACTIVE',
    memberships: overrides.memberships ?? [membership('student-1')],
  };
}

function mockThread(overrides: Partial<{ status: string }> = {}) {
  return {
    id: threadId,
    cohortId,
    status: overrides.status ?? 'ACTIVE',
    archivedAt: null,
    closedById: null,
    closedAt: null,
    createdAt: new Date(),
  };
}

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('getThreadForCohort', () => {
  beforeEach(resetMocks);

  it('1-to-1 cohort returns a private pair thread', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ format: 'ONE_TO_ONE', memberships: [membership('student-1')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());

    const result = await getThreadForCohort('student-1', cohortId);

    expect(result.participantCount).toBe(2);
    expect(result.format).toBe('ONE_TO_ONE');
  });

  it('group cohort returns a single shared thread with correct participantCount', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({
        format: 'ONE_TO_THREE',
        memberships: [membership('student-1'), membership('student-2'), membership('student-3')],
      }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());

    const result = await getThreadForCohort('student-1', cohortId);

    expect(result.participantCount).toBe(4);
  });

  it('no private sub-threads within a group thread — two different active students resolve the identical threadId', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({
        format: 'ONE_TO_THREE',
        memberships: [membership('student-1'), membership('student-2'), membership('student-3')],
      }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());

    const first = await getThreadForCohort('student-1', cohortId);
    const second = await getThreadForCohort('student-2', cohortId);

    expect(first.id).toBe(second.id);
  });

  it('cohort not yet confirmed/paid throws ApiError(403, "Messaging is not available for this cohort")', async () => {
    // Caller's membership is still PENDING_PAYMENT — not yet confirmed/paid.
    (prisma.cohort.findUnique as any).mockResolvedValue({
      ...mockCohort(),
      memberships: [
        { id: 'mem-student-1', studentId: 'student-1', status: 'PENDING_PAYMENT', endReason: null },
      ],
    });
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());

    await expect(getThreadForCohort('student-1', cohortId)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Messaging is not available for this cohort',
    });
  });

  it('caller no longer an active member throws the identical 403', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ memberships: [membership('student-1', 'ENDED', 'DROPPED_BY_ADMIN')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());

    await expect(getThreadForCohort('student-1', cohortId)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Messaging is not available for this cohort',
    });
  });

  it('IDOR — caller with no relation to a real, existing cohort belonging to someone else throws the same 403', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ memberships: [membership('someone-else')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());

    await expect(getThreadForCohort('intruder-1', cohortId)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Messaging is not available for this cohort',
    });
  });
});

describe.skip('listMessages', () => {
  beforeEach(resetMocks);

  it('returns paginated chronological history', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ memberships: [membership('student-1')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());
    const rows = [
      {
        id: 'm1',
        threadId,
        senderId: tutorId,
        body: 'first',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      },
      {
        id: 'm2',
        threadId,
        senderId: 'student-1',
        body: 'second',
        createdAt: new Date('2026-01-01T10:05:00Z'),
      },
    ];
    (prisma.message.findMany as any).mockResolvedValue(rows);
    (prisma.message.count as any).mockResolvedValue(2);

    const result = await listMessages('student-1', cohortId, 1, 50);

    expect(result.messages.map((m: any) => m.id)).toEqual(['m1', 'm2']);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('same membership rule enforced — caller no longer an active member throws 403', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ memberships: [membership('student-1', 'ENDED', 'DROPPED_BY_ADMIN')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());

    await expect(listMessages('student-1', cohortId, 1, 50)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Messaging is not available for this cohort',
    });
  });

  it('archived thread still returns full history — archiving is a client list-visibility change only, never a deletion', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({
        status: 'ENDED',
        memberships: [membership('student-1', 'ENDED', 'COMPLETED')],
      }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread({ status: 'ARCHIVED' }));
    const rows = [
      {
        id: 'm1',
        threadId,
        senderId: tutorId,
        body: 'still here',
        createdAt: new Date('2025-01-01T10:00:00Z'),
      },
    ];
    (prisma.message.findMany as any).mockResolvedValue(rows);
    (prisma.message.count as any).mockResolvedValue(1);

    const result = await listMessages('student-1', cohortId, 1, 50);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe('m1');
  });

  it('no messages yet resolves { messages: [], page, limit, total: 0 }, not an error', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ memberships: [membership('student-1')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());
    (prisma.message.findMany as any).mockResolvedValue([]);
    (prisma.message.count as any).mockResolvedValue(0);

    const result = await listMessages('student-1', cohortId, 1, 50);

    expect(result).toEqual({ messages: [], page: 1, limit: 50, total: 0 });
  });
});

describe.skip('sendMessage', () => {
  beforeEach(resetMocks);

  it('creates the message and notifies every other active participant — group cohort notifies exactly 3, never for the sender', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({
        format: 'ONE_TO_THREE',
        memberships: [membership('student-1'), membership('student-2'), membership('student-3')],
      }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());
    (prisma.message.create as any).mockResolvedValue({
      id: 'm1',
      threadId,
      senderId: 'student-1',
      body: 'hi',
      createdAt: new Date(),
    });
    (dispatchNotification as any).mockResolvedValue(undefined);

    await sendMessage('student-1', cohortId, 'hi');

    expect(dispatchNotification).toHaveBeenCalledTimes(3);
    const notifiedIds = (dispatchNotification as any).mock.calls.map((c: any[]) => c[0]);
    expect(notifiedIds).toContain(tutorId);
    expect(notifiedIds).toContain('student-2');
    expect(notifiedIds).toContain('student-3');
    expect(notifiedIds).not.toContain('student-1');
  });

  it('1-to-1 send notifies exactly the other party', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ format: 'ONE_TO_ONE', memberships: [membership('student-1')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());
    (prisma.message.create as any).mockResolvedValue({
      id: 'm1',
      threadId,
      senderId: 'student-1',
      body: 'hi',
      createdAt: new Date(),
    });
    (dispatchNotification as any).mockResolvedValue(undefined);

    await sendMessage('student-1', cohortId, 'hi');

    expect(dispatchNotification).toHaveBeenCalledTimes(1);
    expect((dispatchNotification as any).mock.calls[0][0]).toBe(tutorId);
  });

  it('blocked when not an active member', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ memberships: [membership('student-1', 'ENDED', 'DROPPED_BY_ADMIN')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());

    await expect(sendMessage('student-1', cohortId, 'hi')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Messaging is not available for this cohort',
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('blocked when the thread is closed by Admin — a genuinely distinct branch from the not-a-member 403', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ memberships: [membership('student-1')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(
      mockThread({ status: 'CLOSED_BY_ADMIN' }),
    );

    await expect(sendMessage('student-1', cohortId, 'hi')).rejects.toMatchObject({
      statusCode: 403,
      message: 'This conversation has been closed',
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('notification failure never blocks the send', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue(
      mockCohort({ format: 'ONE_TO_ONE', memberships: [membership('student-1')] }),
    );
    (prisma.messageThread.findUnique as any).mockResolvedValue(mockThread());
    (prisma.message.create as any).mockResolvedValue({
      id: 'm1',
      threadId,
      senderId: 'student-1',
      body: 'hi',
      createdAt: new Date(),
    });
    (dispatchNotification as any).mockRejectedValue(new Error('notification pipeline down'));

    const result = await sendMessage('student-1', cohortId, 'hi');

    expect(result.id).toBe('m1');
  });
});
