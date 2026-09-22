// src/routes/adminAnnouncement.routes.ts
import { Router } from 'express';

import * as controller from '../controllers/adminAnnouncement.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';

export const adminAnnouncementRouter = Router();

// ── Admin trust actions — Admin-only ──────────────────────────────
adminAnnouncementRouter.post(
  '/',
  authMiddleware,
  requireRole('ADMIN'),
  controller.createAnnouncement,
);

adminAnnouncementRouter.get(
  '/',
  authMiddleware,
  requireRole('ADMIN'),
  controller.listAnnouncements,
);
