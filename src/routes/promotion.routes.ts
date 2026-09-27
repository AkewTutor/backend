import { Router } from 'express';
import { adminCreate, adminEdit, listActive } from '../controllers/promotion.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validateRequest from '../middlewares/validate.middleware.js';
import { createPromotionSchema } from '../schemas/promotion.schema.js';

export const publicPromotionRouter = Router();
publicPromotionRouter.get('/active', listActive);

export const adminPromotionRouter = Router();
adminPromotionRouter.use(authMiddleware, requireRole('ADMIN'));
adminPromotionRouter.post('/', validateRequest(createPromotionSchema), adminCreate);
adminPromotionRouter.patch('/:id', adminEdit);
