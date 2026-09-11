/**
 * tests/routes/adminReporting.routes.test.ts
 *
 * Journey step 8.10 (routes half). Spec: `09-8-support-trust-admin.md` §9.8.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/adminReporting.service.js', () => ({
  aggregatePlatformHealth: vi.fn(),
  getActivityHistory: vi.fn(),
  getTutorPerformanceHistory: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as adminReportingService from '../../src/services/adminReporting.service.js';
import app from '../../src/app.js';

describe.skip('adminReporting.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminReportingService.aggregatePlatformHealth as any).mockResolvedValue({
      openDisputes: 0,
      overdueMatchApprovals: 0,
      recordingComplianceEscalations: 0,
      pendingPayoutBatches: 0,
      generatedAt: new Date().toISOString(),
    });
    (adminReportingService.getActivityHistory as any).mockResolvedValue({
      events: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    (adminReportingService.getTutorPerformanceHistory as any).mockResolvedValue({
      tutors: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it('all three routes require Admin — 401 with no token', async () => {
    const health = await request(app).get('/api/v1/admin/reports/platform-health');
    const activity = await request(app).get('/api/v1/admin/reports/activity');
    const perf = await request(app).get('/api/v1/admin/reports/tutor-performance');

    expect(health.status).toBe(401);
    expect(activity.status).toBe(401);
    expect(perf.status).toBe(401);
  });

  it('all three routes require Admin — 403 with a Tutor token', async () => {
    const health = await request(app)
      .get('/api/v1/admin/reports/platform-health')
      .set('Authorization', 'Bearer tutor-token');
    const activity = await request(app)
      .get('/api/v1/admin/reports/activity')
      .set('Authorization', 'Bearer tutor-token');
    const perf = await request(app)
      .get('/api/v1/admin/reports/tutor-performance')
      .set('Authorization', 'Bearer tutor-token');

    expect(health.status).toBe(403);
    expect(activity.status).toBe(403);
    expect(perf.status).toBe(403);
  });

  it('getActivity validates dateRange/eventType — an invalid dateRange is rejected 400', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/activity?dateRange=NOT_AN_ENUM')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(400);
    expect(adminReportingService.getActivityHistory).not.toHaveBeenCalled();
  });

  it('getActivity validates eventType — an invalid eventType is rejected 400', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/activity?eventType=NOT_A_TYPE')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(400);
  });

  it('GET /admin/reports/platform-health succeeds with an Admin token', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/platform-health')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });

  it('GET /admin/reports/tutor-performance succeeds with an Admin token', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/tutor-performance')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
  });
});
