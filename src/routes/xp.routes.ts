import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { adjustXPSchema } from '../schemas/xp.schema.js';
import { getMyProgress, getLeaderboard, adminAdjust } from '../controllers/xp.controller.js';

export const gamificationXPRouter = Router();
export const adminXPRouter = Router();

// /api/v1/gamification (auth required for both)
gamificationXPRouter.use(authMiddleware);
gamificationXPRouter.get('/xp/me', getMyProgress);
gamificationXPRouter.get('/leaderboard', getLeaderboard);

// /api/v1/admin/students
adminXPRouter.use(authMiddleware, requireRole('ADMIN'));
adminXPRouter.post('/:studentId/xp-adjustments', validate(adjustXPSchema), adminAdjust);
