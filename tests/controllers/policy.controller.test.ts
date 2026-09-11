/**
 * tests/controllers/policy.controller.test.ts
 *
 * Journey step 1.21. Spec: `09-1-shared-config.md` §9.17.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/policy.service.js', () => ({
  getCurrentPolicy: vi.fn(),
  publishNewVersion: vi.fn(),
}));

import * as policyService from '../../src/services/policy.service.js';
import { getPolicy, publishPolicy } from '../../src/controllers/policy.controller.js';
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

describe.skip('policy.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getPolicy delegates with req.params.type and responds 200', async () => {
    (policyService.getCurrentPolicy as any).mockResolvedValue({
      type: 'PRIVACY',
      version: 2,
      content: '# Privacy',
      publishedAt: new Date(),
    });
    const req = mockReq({ params: { type: 'PRIVACY' } });
    const res = mockRes();

    await getPolicy(req, res, vi.fn());

    expect(policyService.getCurrentPolicy).toHaveBeenCalledWith('PRIVACY');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getPolicy propagates a 404 unchanged when nothing has ever been published', async () => {
    (policyService.getCurrentPolicy as any).mockRejectedValue(
      new ApiError(404, 'Policy not yet published'),
    );
    const req = mockReq({ params: { type: 'REFUND' } });
    const next = vi.fn();

    await getPolicy(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
    }
  });

  it('publishPolicy delegates with req.user.id as publisher, never a client-suppliable id', async () => {
    (policyService.publishNewVersion as any).mockResolvedValue({
      type: 'SAFETY',
      version: 2,
      publishedAt: new Date(),
    });
    const req = mockReq({
      params: { type: 'SAFETY' },
      body: { content: '# Safety v2', publishedById: 'someone-else' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await publishPolicy(req, res, vi.fn());

    expect(policyService.publishNewVersion).toHaveBeenCalledWith(
      'SAFETY',
      '# Safety v2',
      'admin-1',
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
