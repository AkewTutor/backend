/**
 * tests/services/adminMessaging.service.test.ts
 *
 * Journey step 5.5. Spec: `09-5-messaging.md` §9.5.
 * FRs: FR-MS-004, FR-AD-017.
 * OWASP: A01:2021 – Broken Access Control (Admin-only surface).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    messageThread: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('../../src/services/messaging.service.js', () => ({
  getThreadForCohort: vi.fn(),
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import * as messagingService from '../../src/services/messaging.service.js';
import { closeThread, viewThreadForDispute } from '../../src/services/adminMessaging.service.js';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('viewThreadForDispute', () => {
  beforeEach(resetMocks);

  it('returns full thread + paginated messages for any thread, no membership restriction applied', async () => {
    (prisma.messageThread.findUnique as any).mockResolvedValue({
      id: 'thread-1',
      cohortId: 'cohort-1',
      status: 'ACTIVE',
    });
    (prisma.message.findMany as any).mockResolvedValue([
      { id: 'm1', threadId: 'thread-1', senderId: 'student-1', body: 'hi', createdAt: new Date() },
    ]);
    (prisma.message.count as any).mockResolvedValue(1);

    const result = await viewThreadForDispute('thread-1', 1, 50);

    expect(result.id).toBe('thread-1');
    expect(result.messages).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
  });

  it("thread doesn't exist throws the common ApiError(404, ...)", async () => {
    (prisma.messageThread.findUnique as any).mockResolvedValue(null);

    await expect(viewThreadForDispute('unknown-thread', 1, 50)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe.skip('closeThread', () => {
  beforeEach(resetMocks);

  it('closes a thread', async () => {
    (prisma.messageThread.findUnique as any).mockResolvedValue({
      id: 'thread-1',
      status: 'ACTIVE',
    });
    (prisma.messageThread.update as any).mockResolvedValue({
      id: 'thread-1',
      status: 'CLOSED_BY_ADMIN',
      closedById: 'admin-1',
      closedAt: new Date(),
    });

    const result = await closeThread('thread-1', 'admin-1', 'Reported for inappropriate content');

    expect(result).toMatchObject({
      id: 'thread-1',
      status: 'CLOSED_BY_ADMIN',
      closedById: 'admin-1',
    });
    expect(result.closedAt).toBeTruthy();
  });

  it('does not itself duplicate the send-blocking check — only writes the MessageThread status row', async () => {
    (prisma.messageThread.findUnique as any).mockResolvedValue({
      id: 'thread-1',
      status: 'ACTIVE',
    });
    (prisma.messageThread.update as any).mockResolvedValue({
      id: 'thread-1',
      status: 'CLOSED_BY_ADMIN',
      closedById: 'admin-1',
      closedAt: new Date(),
    });

    await closeThread('thread-1', 'admin-1', 'reason');

    expect(messagingService.sendMessage).not.toHaveBeenCalled();
    expect(messagingService.getThreadForCohort).not.toHaveBeenCalled();
  });

  it('closing an already-closed thread does not throw an unhandled exception (behavior flagged, not hard-asserted — Doc 8-5 does not specify no-op vs. 409 vs. overwrite)', async () => {
    (prisma.messageThread.findUnique as any).mockResolvedValue({
      id: 'thread-1',
      status: 'CLOSED_BY_ADMIN',
      closedById: 'admin-1',
      closedAt: new Date('2026-01-01T00:00:00Z'),
    });
    (prisma.messageThread.update as any).mockResolvedValue({
      id: 'thread-1',
      status: 'CLOSED_BY_ADMIN',
      closedById: 'admin-2',
      closedAt: new Date(),
    });

    await expect(closeThread('thread-1', 'admin-2', 'closing again')).resolves.toBeDefined();
  });
});
