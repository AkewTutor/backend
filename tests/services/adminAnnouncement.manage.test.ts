import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    announcement: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    notification: { updateMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../../src/services/notification.service.js', () => ({ dispatchNotification: vi.fn() }));

import { prisma } from '../../src/config/db.js';
import {
  deleteAnnouncement,
  updateAnnouncement,
} from '../../src/services/adminAnnouncement.service.js';

const p = prisma as any;
const row = { id: 'a1', title: 'Old', body: 'Old body', audienceRoles: ['STUDENT'] };

beforeEach(() => {
  vi.clearAllMocks();
  p.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('updateAnnouncement', () => {
  it('404s when the announcement does not exist', async () => {
    p.announcement.findUnique.mockResolvedValue(null);
    await expect(updateAnnouncement('a1', { title: 'x' })).rejects.toThrow(
      'Announcement not found',
    );
    expect(p.announcement.update).not.toHaveBeenCalled();
  });

  it('changes only the given field and rewrites delivered notifications', async () => {
    p.announcement.findUnique.mockResolvedValue(row);
    p.announcement.update.mockResolvedValue({ ...row, title: 'New' });
    p.notification.updateMany.mockResolvedValue({ count: 3 });

    const out = await updateAnnouncement('a1', { title: 'New' });

    expect(p.announcement.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { title: 'New', body: 'Old body' },
    });
    expect(p.notification.updateMany).toHaveBeenCalledWith({
      where: {
        type: 'PLATFORM_ANNOUNCEMENT',
        payload: { path: ['announcementId'], equals: 'a1' },
      },
      data: { payload: { announcementId: 'a1', title: 'New', body: 'Old body' } },
    });
    expect(out.title).toBe('New');
  });
});

describe('deleteAnnouncement', () => {
  it('404s and deletes nothing when missing', async () => {
    p.announcement.findUnique.mockResolvedValue(null);
    await expect(deleteAnnouncement('a1')).rejects.toThrow('Announcement not found');
    expect(p.notification.deleteMany).not.toHaveBeenCalled();
    expect(p.announcement.delete).not.toHaveBeenCalled();
  });

  it('removes the announcement and its in-app notifications', async () => {
    p.announcement.findUnique.mockResolvedValue(row);
    p.notification.deleteMany.mockResolvedValue({ count: 3 });
    p.announcement.delete.mockResolvedValue(row);

    await deleteAnnouncement('a1');

    expect(p.notification.deleteMany).toHaveBeenCalledWith({
      where: {
        type: 'PLATFORM_ANNOUNCEMENT',
        payload: { path: ['announcementId'], equals: 'a1' },
      },
    });
    expect(p.announcement.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });
});
