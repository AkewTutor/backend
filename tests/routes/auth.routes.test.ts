/**
 * tests/routes/auth.routes.test.ts
 *
 * Journey step 1.13. Spec: `09-1-shared-config.md` §9.10.
 * OWASP: A01:2021 – Broken Access Control (public/authenticated boundary),
 *        A05:2021 – Security Misconfiguration.
 *
 * Integration (HTTP contract) tier — drives the real Express app
 * (src/app.ts, mounting src/routes/auth.routes.ts) via supertest, with
 * `auth.service.ts` mocked. Proves routing → middleware → controller
 * wiring, not persistence.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

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

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(() => ({ id: 'user-1', role: 'STUDENT' })),
}));

import * as authService from '../../src/services/auth.service.js';
import app from '../../src/app.js';

const validRegisterStudentBody = {
  email: 'stu@example.com',
  password: 'password123',
  grade: 8,
  termsAccepted: true,
};

describe('auth.routes.ts — public/authenticated boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authService.registerUser as any).mockResolvedValue({ userId: 'u1', role: 'STUDENT' });
    (authService.login as any).mockResolvedValue({
      accessToken: 't',
      refreshToken: 'rt',
      user: {},
    });
    (authService.verifyContact as any).mockResolvedValue({ userId: 'u1' });
    (authService.resendVerification as any).mockResolvedValue(undefined);
    (authService.requestPasswordReset as any).mockResolvedValue(undefined);
    (authService.resetPassword as any).mockResolvedValue(undefined);
  });

  it.each([
    ['/api/v1/auth/register/student', validRegisterStudentBody],
    [
      '/api/v1/auth/register/parent',
      { email: 'p@b.com', password: 'password123', termsAccepted: true },
    ],
    [
      '/api/v1/auth/register/tutor',
      { email: 't@b.com', password: 'password123', termsAccepted: true },
    ],
    ['/api/v1/auth/login', { identifier: 'stu@example.com', password: 'password123' }],
    ['/api/v1/auth/verify-contact', { userId: 'u1', code: '123456' }],
    ['/api/v1/auth/resend-verification', { userId: 'u1' }],
    ['/api/v1/auth/forgot-password', { identifier: 'stu@example.com' }],
    ['/api/v1/auth/reset-password', { userId: 'u1', code: 'c', newPassword: 'newpassword123' }],
  ])('%s requires no auth', async (path, body) => {
    const res = await request(app).post(path).send(body);

    expect(res.status).not.toBe(401);
  });

  it('logout requires auth — 401 with no Authorization header, controller never invoked', async () => {
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken: 'rt' });

    expect(res.status).toBe(401);
    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('each register route validates against its own schema — missing grade on student is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register/student')
      .send({ email: 'a@b.com', password: 'password123', termsAccepted: true });

    expect(res.status).toBe(400);
    expect(authService.registerUser).not.toHaveBeenCalled();
  });

  it('register/student rejects an out-of-range grade (15) at the schema layer', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register/student')
      .send({ ...validRegisterStudentBody, grade: 15 });

    expect(res.status).toBe(400);
    expect(authService.registerUser).not.toHaveBeenCalled();
  });

  it('login validates required fields — missing password rejected', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: '' });

    expect(res.status).toBe(400);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('mass-assignment smoke test — an injected role field never reaches the service call', async () => {
    await request(app)
      .post('/api/v1/auth/register/student')
      .send({ ...validRegisterStudentBody, role: 'ADMIN', accountStatus: 'ACTIVE' });

    if ((authService.registerUser as any).mock.calls.length > 0) {
      const receivedBody = (authService.registerUser as any).mock.calls[0][1];
      expect(receivedBody.role).toBeUndefined();
      expect(receivedBody.accountStatus).toBeUndefined();
    }
  });
});
