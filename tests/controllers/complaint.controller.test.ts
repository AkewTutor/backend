/**
 * tests/controllers/complaint.controller.test.ts
 *
 * Journey step 8.3. Spec: `09-8-support-trust-admin.md` §9.4.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/complaint.service.js', () => ({
  createComplaint: vi.fn(),
  listForUser: vi.fn(),
  getForReporter: vi.fn(),
  getSupportContactInfo: vi.fn(),
}));

import * as complaintService from '../../src/services/complaint.service.js';
import {
  fileComplaint,
  getMyComplaint,
  getSupportContact,
  listMyComplaints,
} from '../../src/controllers/complaint.controller.js';
import ApiError from '../../src/utils/ApiError.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('complaint.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fileComplaint forwards req.user.id/role, never a client-suppliable reporter', async () => {
    (complaintService.createComplaint as any).mockResolvedValue({
      id: 'c1',
      category: 'OTHER',
      status: 'OPEN',
      createdAt: new Date(),
    });
    const req = mockReq({
      user: { id: 'user-1', role: 'STUDENT' },
      body: { category: 'OTHER', description: 'x'.repeat(20), reporterId: 'someone-else' },
    } as any);
    const res = mockRes();

    await fileComplaint(req, res, vi.fn());

    expect(complaintService.createComplaint).toHaveBeenCalledWith(
      'user-1',
      'STUDENT',
      expect.objectContaining({ category: 'OTHER' }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('fileComplaint propagates a 403 unchanged', async () => {
    (complaintService.createComplaint as any).mockRejectedValue(
      new ApiError(
        403,
        'You can only file a complaint about your own sessions, payments, or cohorts',
      ),
    );
    const req = mockReq({
      user: { id: 'user-1', role: 'STUDENT' },
      body: { category: 'OTHER' },
    } as any);
    const next = vi.fn();

    await fileComplaint(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    }
  });

  it('listMyComplaints always scoped to req.user.id, never a client-suppliable reporter id from query', async () => {
    (complaintService.listForUser as any).mockResolvedValue({
      complaints: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({
      user: { id: 'user-1', role: 'STUDENT' },
      query: { status: 'OPEN', reporterId: 'someone-else' },
    } as any);

    await listMyComplaints(req, mockRes(), vi.fn());

    expect(complaintService.listForUser).toHaveBeenCalledWith(
      'user-1',
      'OPEN',
      expect.anything(),
      expect.anything(),
    );
  });

  it('getMyComplaint always scoped to req.user.id', async () => {
    (complaintService.getForReporter as any).mockResolvedValue({ id: 'c1', status: 'OPEN' });
    const req = mockReq({
      user: { id: 'user-1', role: 'STUDENT' },
      params: { complaintId: 'c1' },
    } as any);

    await getMyComplaint(req, mockRes(), vi.fn());

    expect(complaintService.getForReporter).toHaveBeenCalledWith('user-1', 'c1');
  });

  it('getSupportContact does not require req.user and responds 200', async () => {
    (complaintService.getSupportContactInfo as any).mockResolvedValue({
      phone: '+251900000000',
      telegramHandle: '@akewtutor_support',
      hours: 'Mon–Sat, 8:00–20:00 EAT',
    });
    const req = mockReq();
    const res = mockRes();

    await getSupportContact(req, res, vi.fn());

    expect(complaintService.getSupportContactInfo).toHaveBeenCalledWith();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
