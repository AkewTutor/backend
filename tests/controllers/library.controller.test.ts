/**
 * tests/controllers/library.controller.test.ts
 *
 * Journey step 4.15. Spec: `09-4-class-delivery-library.md` §9.13.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/library.service.js', () => ({
  uploadMaterial: vi.fn(),
  listCohortMaterials: vi.fn(),
  adminManageLibrary: vi.fn(),
  adminRecordingCompliance: vi.fn(),
}));

import * as libraryService from '../../src/services/library.service.js';
import {
  adminOverride,
  adminRecordingCompliance,
  listForCohort,
  upload,
} from '../../src/controllers/library.controller.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('library.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upload delegates with (req.user.id, req.body.cohortId, req.body.title, req.body.fileType, req.file)', async () => {
    (libraryService.uploadMaterial as any).mockResolvedValue({
      id: 'material-1',
      cohortId: 'cohort-1',
      title: 'Chapter 3 Notes',
      fileType: 'PDF',
      fileUrl: 'https://r2/x.pdf',
    });
    const fileBuffer = Buffer.from('%PDF fake');
    const req = mockReq({
      body: { cohortId: 'cohort-1', title: 'Chapter 3 Notes', fileType: 'PDF' },
      file: { buffer: fileBuffer } as any,
      user: { id: 'tutor-1', role: 'TUTOR' },
    } as any);
    const res = mockRes();

    await upload(req, res, vi.fn());

    expect(libraryService.uploadMaterial).toHaveBeenCalledWith(
      'tutor-1',
      'cohort-1',
      'Chapter 3 Notes',
      'PDF',
      fileBuffer,
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('listForCohort delegates with (req.user.id, req.params.cohortId)', async () => {
    (libraryService.listCohortMaterials as any).mockResolvedValue([]);
    const req = mockReq({
      params: { cohortId: 'cohort-1' },
      user: { id: 'student-1', role: 'STUDENT' },
    } as any);
    const res = mockRes();

    await listForCohort(req, res, vi.fn());

    expect(libraryService.listCohortMaterials).toHaveBeenCalledWith('student-1', 'cohort-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('adminOverride delegates with (req.params.id, req.user.id, req.body)', async () => {
    (libraryService.adminManageLibrary as any).mockResolvedValue({
      id: 'material-1',
      title: 'Updated',
    });
    const req = mockReq({
      params: { id: 'material-1' },
      body: { title: 'Updated' },
      user: { id: 'admin-1', role: 'ADMIN' },
    } as any);
    const res = mockRes();

    await adminOverride(req, res, vi.fn());

    expect(libraryService.adminManageLibrary).toHaveBeenCalledWith('material-1', 'admin-1', {
      title: 'Updated',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('adminRecordingCompliance responds 200 with the compliance queue', async () => {
    (libraryService.adminRecordingCompliance as any).mockResolvedValue({
      sessions: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    const req = mockReq({ user: { id: 'admin-1', role: 'ADMIN' } } as any);
    const res = mockRes();

    await adminRecordingCompliance(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
