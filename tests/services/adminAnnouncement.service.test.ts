/**
 * tests/services/adminAnnouncement.service.test.ts
 *
 * Journey step 1.17. Spec: `09-1-shared-config.md` §9.14.
 * FRs: FR-AD-019.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    user: { findMany: vi.fn() },
    announcement: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../../src/services/notification.service.js', () => ({
  dispatchNotification: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { dispatchNotification } from '../../src/services/notification.service.js';
import {
  adjustNotificationRules,
  composePlatformAnnouncement,
} from '../../src/services/adminAnnouncement.service.js';

function resetMocks() {
  vi.clearAllMocks();
  (dispatchNotification as any).mockResolvedValue(undefined);
}

describe.skip('composePlatformAnnouncement', () => {
  beforeEach(resetMocks);

  it('sends to every user in the target roles, filtered via role: { in: [...] }', async () => {
    (prisma.user.findMany as any).mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]);
    (prisma as any).announcement.create.mockResolvedValue({
      id: 'ann-1',
      title: 'Maintenance',
      audienceRoles: ['STUDENT', 'PARENT'],
      createdById: 'admin-1',
      createdAt: new Date(),
    });

    await composePlatformAnnouncement(
      'Maintenance',
      'Scheduled Sept 10',
      ['STUDENT', 'PARENT'],
      'admin-1',
    );

    expect(dispatchNotification).toHaveBeenCalledTimes(3);
    const findManyArg = (prisma.user.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(findManyArg)).toContain('STUDENT');
    expect(JSON.stringify(findManyArg)).toContain('PARENT');
  });

  it('an empty audience resolves successfully with zero dispatch calls', async () => {
    (prisma.user.findMany as any).mockResolvedValue([]);
    (prisma as any).announcement.create.mockResolvedValue({
      id: 'ann-2',
      title: 'Empty',
      audienceRoles: ['TUTOR'],
      createdById: 'admin-1',
      createdAt: new Date(),
    });

    await expect(
      composePlatformAnnouncement('Empty', 'body', ['TUTOR'], 'admin-1'),
    ).resolves.not.toThrow();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it('eventually notifies every user for a large audience (batching shape left open)', async () => {
    const manyUsers = Array.from({ length: 5000 }, (_, i) => ({ id: `u${i}` }));
    (prisma.user.findMany as any).mockResolvedValue(manyUsers);
    (prisma as any).announcement.create.mockResolvedValue({
      id: 'ann-3',
      title: 'Big',
      audienceRoles: ['STUDENT'],
      createdById: 'admin-1',
      createdAt: new Date(),
    });

    await composePlatformAnnouncement('Big', 'body', ['STUDENT'], 'admin-1');

    expect(dispatchNotification).toHaveBeenCalledTimes(5000);
  });

  it('the returned AnnouncementDTO reflects title/body/audienceRoles/createdById', async () => {
    (prisma.user.findMany as any).mockResolvedValue([{ id: 'u1' }]);
    (prisma as any).announcement.create.mockResolvedValue({
      id: 'ann-4',
      title: 'Scheduled maintenance Sept 10',
      audienceRoles: ['STUDENT', 'PARENT', 'TUTOR'],
      createdById: 'admin-1',
      createdAt: new Date(),
    });

    const result = await composePlatformAnnouncement(
      'Scheduled maintenance Sept 10',
      'details',
      ['STUDENT', 'PARENT', 'TUTOR'],
      'admin-1',
    );

    expect(result).toMatchObject({
      title: 'Scheduled maintenance Sept 10',
      audienceRoles: ['STUDENT', 'PARENT', 'TUTOR'],
      createdById: 'admin-1',
    });
  });
});

describe.skip('adjustNotificationRules (list announcements)', () => {
  beforeEach(resetMocks);

  it('lists announcements paginated', async () => {
    (prisma as any).announcement.findMany.mockResolvedValue([
      { id: 'ann-1', title: 'x', audienceRoles: ['STUDENT'], createdAt: new Date() },
    ]);
    (prisma as any).announcement.count.mockResolvedValue(1);

    const result = await adjustNotificationRules(1, 20);

    expect(result.items.length).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('no announcements yet resolves { items: [], page, limit, total: 0 }, not an error', async () => {
    (prisma as any).announcement.findMany.mockResolvedValue([]);
    (prisma as any).announcement.count.mockResolvedValue(0);

    const result = await adjustNotificationRules(1, 20);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
