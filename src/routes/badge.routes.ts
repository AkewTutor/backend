import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { createBadgeSchema, updateBadgeSchema } from '../schemas/badge.schema.js';
import {
  listMyBadges,
  adminListAll,
  adminCreate,
  adminAdjust,
} from '../controllers/badge.controller.js';

export const gamificationBadgeRouter = Router();
export const adminBadgeRouter = Router();

// /api/v1/gamification/badges
gamificationBadgeRouter.use(authMiddleware);
gamificationBadgeRouter.get('/me', listMyBadges);

// /api/v1/admin/badges
adminBadgeRouter.use(authMiddleware, requireRole('ADMIN'));
adminBadgeRouter.get('/', adminListAll);
adminBadgeRouter.post('/', validate(createBadgeSchema), adminCreate);
adminBadgeRouter.patch('/:badgeId', validate(updateBadgeSchema), adminAdjust);
