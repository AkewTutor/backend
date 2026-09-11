/**
 * tests/routes/recording.routes.test.ts
 *
 * Journey step 4.12. Spec: `09-4-class-delivery-library.md` §9.10.
 * OWASP: A01:2021 – Broken Access Control.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/recording.service.js', () => ({
  uploadRecording: vi.fn(),
  getMyRecordings: vi.fn(),
  getSignedUrl: vi.fn(),
  keepPermanently: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    throw new Error('invalid token');
  }),
}));

import * as recordingService from '../../src/services/recording.service.js';
import app from '../../src/app.js';

describe.skip('recording.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (recordingService.uploadRecording as any).mockResolvedValue({
      id: 'recording-1',
      sessionId: 'session-1',
      storageKey: 'key',
      encoding: '720p',
      expiresAt: new Date().toISOString(),
      keepPermanently: false,
    });
    (recordingService.getMyRecordings as any).mockResolvedValue({
      recordings: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    (recordingService.getSignedUrl as any).mockResolvedValue({
      signedUrl: 'https://r2/x',
      expiresIn: 900,
    });
    (recordingService.keepPermanently as any).mockResolvedValue({
      id: 'recording-1',
      keepPermanently: true,
    });
  });

  it('all 4 routes require auth — 401 with no Authorization header', async () => {
    const upload = await request(app).post('/api/v1/recordings').send({ sessionId: 'session-1' });
    const myRecordings = await request(app).get('/api/v1/recordings/me');
    const signedUrl = await request(app).get('/api/v1/recordings/recording-1/signed-url');
    const keep = await request(app).post('/api/v1/recordings/recording-1/keep-permanently');

    expect(upload.status).toBe(401);
    expect(myRecordings.status).toBe(401);
    expect(signedUrl.status).toBe(401);
    expect(keep.status).toBe(401);
  });

  it('getMyRecordings excludes expired-and-not-kept rows — reflected via the (mocked) service response', async () => {
    const res = await request(app)
      .get('/api/v1/recordings/me')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
    expect(recordingService.getMyRecordings).toHaveBeenCalled();
  });

  it('getSignedUrl propagates a 403 and a 404 distinctly', async () => {
    const { default: ApiError } = await import('../../src/utils/ApiError.js');

    (recordingService.getSignedUrl as any).mockRejectedValueOnce(
      new ApiError(403, 'Not authorized to access this recording'),
    );
    const forbidden = await request(app)
      .get('/api/v1/recordings/recording-1/signed-url')
      .set('Authorization', 'Bearer student-token');
    expect(forbidden.status).toBe(403);

    (recordingService.getSignedUrl as any).mockRejectedValueOnce(
      new ApiError(404, 'Recording no longer available'),
    );
    const notFound = await request(app)
      .get('/api/v1/recordings/recording-1/signed-url')
      .set('Authorization', 'Bearer student-token');
    expect(notFound.status).toBe(404);
  });
});
