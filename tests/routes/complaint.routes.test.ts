/**
 * tests/routes/complaint.routes.test.ts
 *
 * Journey step 8.4. Spec: `09-8-support-trust-admin.md` §9.4.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/complaint.service.js', () => ({
  createComplaint: vi.fn(),
  listForUser: vi.fn(),
  getForReporter: vi.fn(),
  getSupportContactInfo: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'other-student-token') return { id: 'student-2', role: 'STUDENT' };
    throw new Error('invalid token');
  }),
}));

import * as complaintService from '../../src/services/complaint.service.js';
import app from '../../src/app.js';

describe.skip('complaint.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (complaintService.createComplaint as any).mockResolvedValue({
      id: 'c1',
      category: 'OTHER',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    });
    (complaintService.listForUser as any).mockResolvedValue({
      complaints: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (complaintService.getForReporter as any).mockResolvedValue({
      id: 'c1',
      category: 'OTHER',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    });
    (complaintService.getSupportContactInfo as any).mockResolvedValue({
      phone: '+251900000000',
      telegramHandle: '@akewtutor_support',
      hours: 'Mon–Sat, 8:00–20:00 EAT',
    });
  });

  it('fileComplaint/listMyComplaints/getMyComplaint require auth — 401 with no token', async () => {
    const fileRes = await request(app)
      .post('/api/v1/complaints')
      .send({ category: 'OTHER', description: 'x'.repeat(20) });
    const listRes = await request(app).get('/api/v1/complaints/me');
    const getRes = await request(app).get('/api/v1/complaints/c1');

    expect(fileRes.status).toBe(401);
    expect(listRes.status).toBe(401);
    expect(getRes.status).toBe(401);
  });

  it('getSupportContact requires no auth — 200 with no token', async () => {
    const res = await request(app).get('/api/v1/support/contact');

    expect(res.status).toBe(200);
  });

  it('fileComplaint validates body — rejected by the schema, controller never called', async () => {
    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', 'Bearer student-token')
      .send({ category: 'TUTOR_CONDUCT', description: 'x'.repeat(20) });

    expect(res.status).toBe(400);
    expect(complaintService.createComplaint).not.toHaveBeenCalled();
  });

  it('fileComplaint forwards req.user.id/role, never a client-suppliable reporter', async () => {
    const res = await request(app)
      .post('/api/v1/complaints')
      .set('Authorization', 'Bearer student-token')
      .send({ category: 'OTHER', description: 'x'.repeat(20) });

    expect(res.status).toBe(201);
    expect(complaintService.createComplaint).toHaveBeenCalledWith(
      'student-1',
      'STUDENT',
      expect.objectContaining({ category: 'OTHER' }),
    );
  });

  it('listMyComplaints/getMyComplaint always scoped to req.user.id', async () => {
    await request(app).get('/api/v1/complaints/me').set('Authorization', 'Bearer student-token');
    await request(app)
      .get('/api/v1/complaints/c1')
      .set('Authorization', 'Bearer other-student-token');

    expect((complaintService.listForUser as any).mock.calls[0][0]).toBe('student-1');
    expect((complaintService.getForReporter as any).mock.calls[0][0]).toBe('student-2');
  });
});
