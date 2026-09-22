// src/routes/auth.routes.ts
import { Router } from 'express';

import {
  FORGOT_PASSWORD_LIMIT,
  LOGIN_LIMIT,
  RESEND_VERIFICATION_LIMIT,
} from '../config/rateLimits.js';
import * as controller from '../controllers/auth.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import { rateLimiter } from '../middlewares/rateLimiter.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import {
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  refreshSchema,
  registerParentSchema,
  registerStudentSchema,
  registerTutorSchema,
  verifyContactSchema,
} from '../schemas/auth.schema.js';

export const authRouter = Router();

// ── Public registration ───────────────────────────────────────────
authRouter.post(
  '/register/student',
  validate(registerStudentSchema),
  controller.register('STUDENT'),
);
authRouter.post('/register/parent', validate(registerParentSchema), controller.register('PARENT'));
authRouter.post('/register/tutor', validate(registerTutorSchema), controller.register('TUTOR'));

// ── Public session ────────────────────────────────────────────────
authRouter.post('/login', rateLimiter(LOGIN_LIMIT), validate(loginSchema), controller.login);
authRouter.post('/refresh', validate(refreshSchema), controller.refresh);

// ── Authenticated session ─────────────────────────────────────────
authRouter.post('/logout', authMiddleware, controller.logout);
authRouter.post('/logout-all', authMiddleware, controller.logoutAll);

// ── Public verification / password reset ──────────────────────────
authRouter.post('/verify-contact', validate(verifyContactSchema), controller.verify('contact'));
authRouter.post(
  '/resend-verification',
  rateLimiter(RESEND_VERIFICATION_LIMIT),
  controller.verify('resend'),
);
authRouter.post(
  '/forgot-password',
  rateLimiter(FORGOT_PASSWORD_LIMIT),
  validate(passwordResetRequestSchema),
  controller.forgotPassword,
);
authRouter.post('/reset-password', validate(passwordResetSchema), controller.resetPassword);
