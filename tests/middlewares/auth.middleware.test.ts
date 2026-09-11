/**
 * tests/middlewares/auth.middleware.test.ts
 *
 * Journey step 1.1. Spec: `09-1-shared-config.md` §9.2.
 * FRs: (infrastructure for every authenticated FR). NFRs: NFR-007, NFR-009.
 * OWASP: A07:2021 – Identification and Authentication Failures,
 *        A01:2021 – Broken Access Control.
 *
 * Unit tier — `verifyAccessToken` (src/utils/jwt.ts) is mocked; nothing here
 * touches a real JWT or a real database. `prisma` (src/config/db.ts) is also
 * mocked solely so the "does not re-fetch the User row" case has something
 * to assert zero calls against (Rule 5 — the mock's presence doesn't imply
 * the SUT imports it, only that if it ever does, this test still passes).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';

vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { verifyAccessToken } from '../../src/utils/jwt.js';
import { prisma } from '../../src/config/db.js';
import authMiddleware, { requireRole } from '../../src/middlewares/auth.middleware.js';
import ApiError from '../../src/utils/ApiError.js';

function mockReq(headers: Record<string, string> = {}, user?: { id: string; role: string }) {
  return { headers, user } as any;
}

function mockRes(): Response {
  return {} as Response;
}

function mockNext(): NextFunction & ReturnType<typeof vi.fn> {
  return vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
}

describe('authMiddleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('valid token — attaches req.user and calls next() with no error', () => {
    (verifyAccessToken as any).mockReturnValue({ id: 'user-1', role: 'STUDENT' });
    const req = mockReq({ authorization: 'Bearer valid.token.here' });
    const next = mockNext();

    authMiddleware(req, mockRes(), next);

    expect(req.user).toEqual({ id: 'user-1', role: 'STUDENT' });
    expect(next).toHaveBeenCalledWith();
  });

  it('missing Authorization header throws ApiError(401)', () => {
    const req = mockReq({});
    const next = mockNext();

    authMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Missing, invalid, or expired token');
  });

  it('malformed header (no "Bearer " prefix) throws the identical ApiError(401)', () => {
    const req = mockReq({ authorization: 'sometoken' });
    const next = mockNext();

    authMiddleware(req, mockRes(), next);

    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Missing, invalid, or expired token');
  });

  it('expired token (TokenExpiredError) throws ApiError(401) without distinguishing the reason', () => {
    class TokenExpiredError extends Error {}
    (verifyAccessToken as any).mockImplementation(() => {
      throw new TokenExpiredError('jwt expired');
    });
    const req = mockReq({ authorization: 'Bearer expired.token.here' });
    const next = mockNext();

    authMiddleware(req, mockRes(), next);

    const err = (next as any).mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Missing, invalid, or expired token');
  });

  it('signature mismatch / tampered token (JsonWebTokenError) throws the identical ApiError(401)', () => {
    class JsonWebTokenError extends Error {}
    (verifyAccessToken as any).mockImplementation(() => {
      throw new JsonWebTokenError('invalid signature');
    });
    const req = mockReq({ authorization: 'Bearer tampered.token.here' });
    const next = mockNext();

    authMiddleware(req, mockRes(), next);

    const err = (next as any).mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Missing, invalid, or expired token');
  });

  it('does not re-fetch the User row — req.user is built solely from the token payload', () => {
    (verifyAccessToken as any).mockReturnValue({ id: 'user-1', role: 'STUDENT' });
    const req = mockReq({ authorization: 'Bearer valid.token.here' });
    const next = mockNext();

    authMiddleware(req, mockRes(), next);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('algorithm-confusion / "none" algorithm token is rejected the same way as any other invalid token', () => {
    // The actual algorithm-pinning behavior is exercised for real in
    // jwt.test.ts (verifyAccessToken itself). Here we only confirm the
    // middleware doesn't special-case an algorithm-confusion rejection into
    // a different status/message than any other verification failure.
    (verifyAccessToken as any).mockImplementation(() => {
      throw new Error('jwt algorithm invalid');
    });
    const req = mockReq({ authorization: 'Bearer alg-none.tampered.token' });
    const next = mockNext();

    authMiddleware(req, mockRes(), next);

    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Missing, invalid, or expired token');
  });
});

describe('requireRole', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('role in allow-list calls next() with no error', () => {
    const req = mockReq({}, { id: 'admin-1', role: 'ADMIN' });
    const next = mockNext();

    requireRole('ADMIN')(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('role not in allow-list throws ApiError(403, "Insufficient permissions")', () => {
    const req = mockReq({}, { id: 'student-1', role: 'STUDENT' });
    const next = mockNext();

    requireRole('ADMIN')(req, mockRes(), next);

    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Insufficient permissions');
  });

  it('multiple allowed roles — a matching role calls next()', () => {
    const req = mockReq({}, { id: 'parent-1', role: 'PARENT' });
    const next = mockNext();

    requireRole('STUDENT', 'PARENT')(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
  });

  it('called without authMiddleware having run (no req.user) fails gracefully, not an unhandled TypeError', () => {
    const req = mockReq({}, undefined);
    const next = mockNext();

    expect(() => requireRole('ADMIN')(req, mockRes(), next)).not.toThrow();

    const err = (next as any).mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect([401, 403]).toContain(err.statusCode);
  });
});
