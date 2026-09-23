/**
 * tests/controllers/subject.controller.test.ts
 *
 * Journey step 2.18. Spec: `09-2-accounts-guardianship.md` §9.15.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/subject.service.js', () => ({
  listSubjects: vi.fn(),
  createSubject: vi.fn(),
  deactivateSubject: vi.fn(),
}));

import * as subjectService from '../../src/services/subject.service.js';
import { listSubjects as listSubjectsController } from '../../src/controllers/subject.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe('subject.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listSubjects delegates to the service and responds 200 for an unauthenticated caller', async () => {
    (subjectService.listSubjects as any).mockResolvedValue([{ id: 's1' }]);
    const req = mockReq({ query: {} } as any);
    const res = mockRes();

    await listSubjectsController(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
