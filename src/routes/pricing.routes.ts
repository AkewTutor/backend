import { Router } from 'express';
import { getActive, adminUpdate } from '../controllers/pricing.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { updatePricingConfigSchema } from '../schemas/pricing.schema.js';

export const pricingRouter = Router();
export const adminPricingRouter = Router();

pricingRouter.get('/', getActive);

adminPricingRouter.put(
  '/:format',
  authMiddleware,
  requireRole('ADMIN'),
  validate(updatePricingConfigSchema),
  adminUpdate,
);
