// src/controllers/auth.controller.ts
import type { NextFunction, Request, Response, RequestHandler } from 'express';

import * as authService from '../services/auth.service.js';
import type { AuthRequest } from '../types/index.js';

type RegisterRole = 'STUDENT' | 'PARENT' | 'TUTOR';
type VerifyMode = 'contact' | 'resend';

function send(res: Response, statusCode: number, data: unknown): void {
  res.status(statusCode).json({
    statusCode,
    success: true,
    message: 'OK',
    data,
  });
}

/**
 * Route-bound registration handler factory. The role is fixed by the
 * route (`/register/student`, `/register/parent`, `/register/tutor`) and
 * is never read from the request body — this is what makes a
 * `role: 'ADMIN'` injection attempt a no-op even before the schema's
 * unknown-key stripping.
 */
export function register(role: RegisterRole): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await authService.registerUser(role, req.body);
      send(res, 201, result);
    } catch (err) {
      next(err);
    }
  };
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login(req.body.identifier, req.body.password);
    send(res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.refreshAccessToken(req.body.refreshToken);
    send(res, 200, result);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.logout(req.body.refreshToken);
    send(res, 200, {});
  } catch (err) {
    next(err);
  }
}

export async function logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthRequest).user?.id as string;
    await authService.logoutAll(userId);
    send(res, 200, {});
  } catch (err) {
    next(err);
  }
}

/**
 * Route-bound verify handler factory — the two verify routes share a
 * single handler name but genuinely branch to different service calls
 * (`verifyContact` vs. `resendVerification`). The mode is fixed by the
 * route, never client-supplied.
 */
export function verify(mode: VerifyMode): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (mode === 'contact') {
        const result = await authService.verifyContact(req.body.userId, req.body.code);
        send(res, 200, result);
      } else {
        await authService.resendVerification(req.body.userId);
        send(res, 200, { resent: true });
      }
    } catch (err) {
      next(err);
    }
  };
}

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authService.requestPasswordReset(req.body.identifier);
    // Always 200 regardless of whether the identifier matched — the
    // service guarantees the same outward shape for both cases.
    send(res, 200, {});
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await authService.resetPassword(req.body.userId, req.body.code, req.body.newPassword);
    send(res, 200, {});
  } catch (err) {
    next(err);
  }
}
