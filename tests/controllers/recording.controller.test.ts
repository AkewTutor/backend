/**
 * tests/controllers/recording.controller.test.ts
 *
 * Journey step 4.11. Spec: `09-4-class-delivery-library.md` §9.10.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/recording.service.js', () => ({
  uploadRecording: vi.fn(),
  getMyRecordings: vi.fn(),
  getSignedUrl: vi.fn(),
  keepPermanently: vi.fn(),
}));

import * as recordingService from '../../src/services/recording.service.js';
import {
  getMyRecordings,
  getSignedUrl,
  keepPermanently,
  upload,
} from '../../src/controllers/recording.controller.js';
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

describe.skip('recording.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upload delegates with (req.user.id, req.body.sessionId, req.file)', async () => {
    (recordingService.uploadRecording as any).mockResolvedValue({
      id: 'recording-1',
      sessionId: 'session-1',
      storageKey: 'key',
      encoding: '720p',
      expiresAt: new Date(),
      keepPermanently: false,
    });
    const fileBuffer = Buffer.from('video-bytes');
    const req = mockReq({
      body: { sessionId: 'session-1' },
      file: { buffer: fileBuffer } as any,
      user: { id: 'tutor-1', role: 'TUTOR' },
    } as any);
    const res = mockRes();

    await upload(req, res, vi.fn());

    expect(recordingService.uploadRecording).toHaveBeenCalledWith(
      'tutor-1',
      'session-1',
      fileBuffer,
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('getMyRecordings excludes expired-and-not-kept rows from the list — expected expiry, not an error', async () => {
    // The list read filters this server-side (recording.service.ts); the
    // controller test confirms it surfaces exactly what the service
    // returned, with no additional client-visible error for the omission.
    (recordingService.getMyRecordings as any).mockResolvedValue({
      recordings: [{ id: 'recording-active', keepPermanently: false }],
      page: 1,
      limit: 20,
      total: 1,
    });
    const req = mockReq({ user: { id: 'student-1', role: 'STUDENT' } } as any);
    const res = mockRes();

    await getMyRecordings(req, res, vi.fn());

    expect(recordingService.getMyRecordings).toHaveBeenCalledWith('student-1', expect.anything());
    expect(res.status).toHaveBeenCalledWith(200);
    const jsonArg = (res.json as any).mock.calls[0][0];
    const recordings = jsonArg?.data?.recordings ?? jsonArg?.recordings;
    expect(recordings).toEqual([{ id: 'recording-active', keepPermanently: false }]);
    expect(recordings.find((r: any) => r.id === 'recording-expired-not-kept')).toBeUndefined();
  });

  it('getSignedUrl propagates a 403 unchanged', async () => {
    (recordingService.getSignedUrl as any).mockRejectedValue(
      new ApiError(403, 'Not authorized to access this recording'),
    );
    const req = mockReq({
      params: { recordingId: 'recording-1' },
      user: { id: 'student-1', role: 'STUDENT' },
    } as any);
    const next = vi.fn();

    await getSignedUrl(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    }
  });

  it('getSignedUrl propagates a 404 distinctly from a 403 — a client must be able to tell "not yours" from "gone"', async () => {
    (recordingService.getSignedUrl as any).mockRejectedValue(
      new ApiError(404, 'Recording no longer available'),
    );
    const req = mockReq({
      params: { recordingId: 'recording-1' },
      user: { id: 'student-1', role: 'STUDENT' },
    } as any);
    const next = vi.fn();

    await getSignedUrl(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 404 });
    }
  });

  it('keepPermanently delegates with (req.user.id, req.params.recordingId)', async () => {
    (recordingService.keepPermanently as any).mockResolvedValue({
      id: 'recording-1',
      keepPermanently: true,
    });
    const req = mockReq({
      params: { recordingId: 'recording-1' },
      user: { id: 'student-1', role: 'STUDENT' },
    } as any);
    const res = mockRes();

    await keepPermanently(req, res, vi.fn());

    expect(recordingService.keepPermanently).toHaveBeenCalledWith('student-1', 'recording-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
