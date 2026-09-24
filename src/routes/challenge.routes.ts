import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { createChallengeSchema } from '../schemas/challenge.schema.js';
import { listActive, getMyProgress, adminCreate } from '../controllers/challenge.controller.js';

export const gamificationChallengeRouter = Router();
export const adminChallengeRouter = Router();

// /api/v1/gamification/challenges
gamificationChallengeRouter.use(authMiddleware);
gamificationChallengeRouter.get('/', requireRole('STUDENT', 'PARENT'), listActive);
gamificationChallengeRouter.get('/me', requireRole('STUDENT', 'PARENT'), getMyProgress);

// /api/v1/admin/challenges
adminChallengeRouter.use(authMiddleware, requireRole('ADMIN'));
adminChallengeRouter.post('/', validate(createChallengeSchema), adminCreate);
