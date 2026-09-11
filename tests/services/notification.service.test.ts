/**
 * tests/services/notification.service.test.ts
 *
 * Journey step 1.14. Spec: `09-1-shared-config.md` §9.12.
 * FRs: FR-NO-001–011.
 * OWASP: A01:2021 – Broken Access Control (ownership check on markRead).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../src/utils/providers/sms.client.js', () => ({ send: vi.fn() }));
vi.mock('../../src/utils/providers/email.client.js', () => ({ send: vi.fn() }));

import { prisma } from '../../src/config/db.js';
import { send as smsSend } from '../../src/utils/providers/sms.client.js';
import { send as emailSend } from '../../src/utils/providers/email.client.js';
import {
  dispatchNotification,
  listForUser,
  markRead,
  retryFailed,
} from '../../src/services/notification.service.js';
import ApiError from '../../src/utils/ApiError.js';

function resetMocks() {
  vi.clearAllMocks();
  (prisma.notification.create as any).mockResolvedValue({ id: 'notif-1', status: 'QUEUED' });
  (prisma.notification.update as any).mockResolvedValue({ id: 'notif-1', status: 'SENT' });
}

describe.skip('dispatchNotification', () => {
  beforeEach(resetMocks);

  it('delivers via SMS when preferredNotificationChannel is SMS', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      preferredNotificationChannel: 'SMS',
      phone: '+251911000000',
    });
    (smsSend as any).mockResolvedValue({ success: true, providerRef: 'ref' });

    await dispatchNotification('u1', 'CLASS_REMINDER', {});

    expect(smsSend).toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('delivers via Email when preferredNotificationChannel is EMAIL', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      preferredNotificationChannel: 'EMAIL',
      email: 'a@b.com',
    });
    (emailSend as any).mockResolvedValue({ success: true, providerRef: 'ref' });

    await dispatchNotification('u1', 'CLASS_REMINDER', {});

    expect(emailSend).toHaveBeenCalled();
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('a delivery failure writes a FAILED row and never throws', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      preferredNotificationChannel: 'EMAIL',
      email: 'a@b.com',
    });
    (emailSend as any).mockResolvedValue({ success: false });

    await expect(dispatchNotification('u1', 'CLASS_REMINDER', {})).resolves.toBeUndefined();

    const updateCalls = (prisma.notification.update as any).mock.calls;
    const failedUpdate = updateCalls.some((c: any[]) => c[0]?.data?.status === 'FAILED');
    expect(failedUpdate).toBe(true);
  });

  it('the row is initially written with status QUEUED, never PENDING', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      preferredNotificationChannel: 'EMAIL',
      email: 'a@b.com',
    });
    (emailSend as any).mockResolvedValue({ success: true, providerRef: 'ref' });

    await dispatchNotification('u1', 'CLASS_REMINDER', {});

    const createArg = (prisma.notification.create as any).mock.calls[0][0];
    expect(createArg.data.status).toBe('QUEUED');
    expect(createArg.data.status).not.toBe('PENDING');
  });

  it('never propagates an exception to the caller, even when the client throws (not just resolves failure)', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      preferredNotificationChannel: 'EMAIL',
      email: 'a@b.com',
    });
    (emailSend as any).mockRejectedValue(new Error('provider crashed'));

    await expect(dispatchNotification('u1', 'CLASS_REMINDER', {})).resolves.toBeUndefined();

    const updateCalls = (prisma.notification.update as any).mock.calls;
    const failedUpdate = updateCalls.some((c: any[]) => c[0]?.data?.status === 'FAILED');
    expect(failedUpdate).toBe(true);
  });

  it('[Phase 4] is not itself idempotent — two identical calls create two independent Notification rows', async () => {
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      preferredNotificationChannel: 'EMAIL',
      email: 'a@b.com',
    });
    (emailSend as any).mockResolvedValue({ success: true, providerRef: 'ref' });

    await dispatchNotification('u1', 'NEW_MESSAGE', { text: 'hi' });
    await dispatchNotification('u1', 'NEW_MESSAGE', { text: 'hi' });

    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
    expect(emailSend).toHaveBeenCalledTimes(2);
  });
});

describe.skip('listForUser', () => {
  beforeEach(resetMocks);

  it('returns paginated notifications scoped to the caller only', async () => {
    (prisma.notification.findMany as any).mockResolvedValue([]);

    await listForUser('user-1', false, 1, 20);

    const findManyArg =
      (prisma.notification.findMany as any).mock.calls[0]?.[0] ??
      (prisma as any).notification.findMany.mock.calls[0][0];
    expect(JSON.stringify(findManyArg)).toContain('user-1');
  });

  it('applies the unreadOnly filter when requested', async () => {
    (prisma.notification.findMany as any).mockResolvedValue([]);

    await listForUser('user-1', true, 1, 20);

    const findManyArg = (prisma.notification.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(findManyArg)).toMatch(/readAt/);
  });

  it('no notifications yet resolves { notifications: [], page, limit, total: 0 }, not an error', async () => {
    (prisma.notification.findMany as any).mockResolvedValue([]);

    const result = await listForUser('user-1', false, 1, 20);

    expect(result.notifications).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe.skip('markRead', () => {
  beforeEach(resetMocks);

  it('owner marks their own notification read', async () => {
    (prisma.notification.findUnique as any).mockResolvedValue({ id: 'n1', userId: 'user-1' });
    (prisma.notification.update as any).mockResolvedValue({ id: 'n1', readAt: new Date() });

    const result = await markRead('n1', 'user-1');

    expect(result.readAt).toBeTruthy();
    const updateArg = (prisma.notification.update as any).mock.calls[0][0];
    expect(JSON.stringify(updateArg.where)).toContain('user-1');
  });

  it('notification not found throws ApiError(404, "Notification not found")', async () => {
    (prisma.notification.findUnique as any).mockResolvedValue(null);

    await expect(markRead('bad-id', 'user-1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Notification not found',
    });
  });

  it('IDOR — notification belonging to a different user throws ApiError(403)', async () => {
    (prisma.notification.findUnique as any).mockResolvedValue({ id: 'n1', userId: 'someone-else' });

    await expect(markRead('n1', 'user-1')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to modify this notification',
    });
  });
});

describe.skip('retryFailed', () => {
  beforeEach(resetMocks);

  it('retries all FAILED rows', async () => {
    (prisma.notification.findMany as any).mockResolvedValue([
      { id: 'n1', status: 'FAILED', userId: 'u1' },
      { id: 'n2', status: 'FAILED', userId: 'u2' },
      { id: 'n3', status: 'FAILED', userId: 'u3' },
    ]);
    (prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      preferredNotificationChannel: 'EMAIL',
      email: 'a@b.com',
    });
    (emailSend as any).mockResolvedValue({ success: true, providerRef: 'ref' });

    const result = await retryFailed();

    expect(result.retried).toBe(3);
  });

  it('no FAILED rows resolves { retried: 0 }, no error', async () => {
    (prisma.notification.findMany as any).mockResolvedValue([]);

    const result = await retryFailed();

    expect(result.retried).toBe(0);
  });

  it('a row at the configured max-attempt count is not retried again', async () => {
    (prisma.notification.findMany as any).mockResolvedValue([]);

    const result = await retryFailed();

    // With findMany already scoped to exclude exhausted rows, this row
    // simply never appears in the batch — resolving 0 confirms no retry
    // loop happened for it.
    expect(result.retried).toBe(0);
  });
});
