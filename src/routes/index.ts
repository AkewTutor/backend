// src/routes/index.ts
import { Router } from 'express';

import { adminAnnouncementRouter } from './adminAnnouncement.routes.js';
import { authRouter } from './auth.routes.js';
import { notificationRouter } from './notification.routes.js';
import { policyRouter } from './policy.routes.js';

const router = Router();

// ── shared-config ─────────────────────────────────────────────────
router.use('/auth', authRouter);
router.use('/notifications', notificationRouter);
router.use('/admin/announcements', adminAnnouncementRouter);
router.use('/policies', policyRouter);

export default router;
