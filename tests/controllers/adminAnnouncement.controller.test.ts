/**
 * tests/controllers/adminAnnouncement.controller.test.ts
 *
 * Journey step 1.18 (controller half). Spec: `09-1-shared-config.md` §9.15.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/adminAnnouncement.service.js', () => ({
  composePlatformAnnouncement: vi.fn(),
  adjustNotificationRules: vi.fn(),
}));

import * as adminAnnouncementService from '../../src/services/adminAnnouncement.service.js';
import {
  createAnnouncement,
  listAnnouncements,
} from '../../src/controllers/adminAnnouncement.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('adminAnnouncement.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createAnnouncement delegates with req.user.id as creator, never a client-suppliable id', async () => {
    (adminAnnouncementService.composePlatformAnnouncement as any).mockResolvedValue({
      id: 'ann-1',
      title: 'Maintenance',
      audienceRoles: ['STUDENT'],
      createdAt: new Date(),
    });
    const req = mockReq({
      body: {
        title: 'Maintenance',
        body: 'text',
        audienceRoles: ['STUDENT'],
        createdById: 'someone-else',
      },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await createAnnouncement(req, res, vi.fn());

    expect(adminAnnouncementService.composePlatformAnnouncement).toHaveBeenCalledWith(
      'Maintenance',
      'text',
      ['STUDENT'],
      'admin-1',
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('listAnnouncements delegates with pagination params', async () => {
    (adminAnnouncementService.adjustNotificationRules as any).mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      query: { page: '1', limit: '20' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await listAnnouncements(req, res, vi.fn());

    expect(adminAnnouncementService.adjustNotificationRules).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
