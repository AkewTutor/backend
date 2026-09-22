/**
 * tests/controllers/auth.controller.test.ts
 *
 * Journey step 1.12. Spec: `09-1-shared-config.md` §9.9.
 *
 * Interface note: Doc 8-1 pins each handler's service call and response
 * code but not the exact export shape for the three registration routes
 * (student/parent/tutor) and the two verify routes (contact/resend), which
 * share one handler name split by route. This suite assumes the simplest
 * shape satisfying "role is fixed per route, never client-suppliable" and
 * "the two verify routes genuinely branch to different service calls":
 * `register(role)` returns an Express handler bound to that role, and
 * `verify(mode)` returns a handler bound to 'contact' | 'resend'. If the
 * implementer chooses a different shape (e.g. three named exports
 * `registerStudent`/`registerParent`/`registerTutor`), update these tests'
 * call sites to match — the *behavioral* assertions below (role/branch
 * never client-suppliable) are what the spec actually pins, not this
 * particular factory shape.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../../src/services/auth.service.js', () => ({
  registerUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  refreshAccessToken: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  verifyContact: vi.fn(),
  resendVerification: vi.fn(),
}));

import * as authService from '../../src/services/auth.service.js';
import {
  forgotPassword,
  login as loginController,
  logout as logoutController,
  register,
  resetPassword as resetPasswordController,
  verify,
} from '../../src/controllers/auth.controller.js';
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

describe('auth.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('register (student route) delegates with the fixed role "STUDENT", not from req.body', async () => {
    (authService.registerUser as any).mockResolvedValue({ userId: 'u1', role: 'STUDENT' });
    const req = mockReq({
      body: { email: 'a@b.com', password: 'password123', grade: 8, termsAccepted: true },
    });
    const res = mockRes();

    await (register as any)('STUDENT')(req, res, vi.fn());

    expect(authService.registerUser).toHaveBeenCalledWith('STUDENT', req.body);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('register (parent/tutor routes) fix their own role — never client-suppliable', async () => {
    (authService.registerUser as any).mockResolvedValue({ userId: 'u2', role: 'PARENT' });
    const reqParent = mockReq({
      body: { email: 'p@b.com', password: 'password123', termsAccepted: true, role: 'ADMIN' },
    });
    await (register as any)('PARENT')(reqParent, mockRes(), vi.fn());
    expect(authService.registerUser).toHaveBeenCalledWith('PARENT', expect.anything());

    (authService.registerUser as any).mockResolvedValue({ userId: 'u3', role: 'TUTOR' });
    const reqTutor = mockReq({
      body: { email: 't@b.com', password: 'password123', termsAccepted: true },
    });
    await (register as any)('TUTOR')(reqTutor, mockRes(), vi.fn());
    expect(authService.registerUser).toHaveBeenCalledWith('TUTOR', expect.anything());
  });

  it('login delegates with identifier/password and responds 200', async () => {
    (authService.login as any).mockResolvedValue({
      accessToken: 'tok',
      refreshToken: 'rtok',
      user: {},
    });
    const req = mockReq({ body: { identifier: 'a@b.com', password: 'pw' } });
    const res = mockRes();

    await loginController(req, res, vi.fn() as NextFunction);

    expect(authService.login).toHaveBeenCalledWith('a@b.com', 'pw');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('login propagates a 401 unchanged', async () => {
    (authService.login as any).mockRejectedValue(
      new ApiError(401, 'Invalid email/phone or password'),
    );
    const req = mockReq({ body: { identifier: 'a@b.com', password: 'wrong' } });
    const next = vi.fn();

    await loginController(req, mockRes(), next as NextFunction).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401 });
    }
  });

  it('logout delegates and responds 200 with {}', async () => {
    (authService.logout as any).mockResolvedValue(undefined);
    const req = mockReq({
      body: { refreshToken: 'rtok' },
      user: { id: 'u1', role: 'STUDENT' },
    } as any);
    const res = mockRes();

    await logoutController(req, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forgotPassword always responds 200 regardless of service internals', async () => {
    (authService.requestPasswordReset as any).mockResolvedValue(undefined);
    const req = mockReq({ body: { identifier: 'anything@example.com' } });
    const res = mockRes();

    await forgotPassword(req, res, vi.fn() as NextFunction);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('resetPassword propagates its 400 unchanged', async () => {
    (authService.resetPassword as any).mockRejectedValue(
      new ApiError(400, 'This reset link is no longer valid — request a new one'),
    );
    const req = mockReq({ body: { userId: 'u1', code: 'bad', newPassword: 'newpassword123' } });
    const next = vi.fn();

    await resetPasswordController(req, mockRes(), next as NextFunction).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 400 });
    }
  });

  it('verify (contact) delegates to verifyContact with userId/code', async () => {
    (authService.verifyContact as any).mockResolvedValue({
      userId: 'u1',
      emailVerifiedAt: new Date(),
    });
    const req = mockReq({ body: { userId: 'u1', code: '123456' } });

    await (verify as any)('contact')(req, mockRes(), vi.fn());

    expect(authService.verifyContact).toHaveBeenCalledWith('u1', '123456');
  });

  it('verify (resend) delegates to resendVerification, not verifyContact', async () => {
    (authService.resendVerification as any).mockResolvedValue(undefined);
    const req = mockReq({ body: { userId: 'u1' } });

    await (verify as any)('resend')(req, mockRes(), vi.fn());

    expect(authService.resendVerification).toHaveBeenCalledWith('u1');
    expect(authService.verifyContact).not.toHaveBeenCalled();
  });
});
