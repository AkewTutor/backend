import { Router } from 'express';
import { initiate, webhook, getHistory } from '../controllers/payment.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { initiatePaymentSchema } from '../schemas/payment.schema.js';
import { rateLimiter } from '../middlewares/rateLimiter.middleware.js';
import { PAYMENT_INITIATE_LIMIT } from '../config/rateLimits.js';

const initiateLimiter = rateLimiter(PAYMENT_INITIATE_LIMIT); // 10/hour, skipped in development

const router = Router();

router.post(
  '/initiate',
  authMiddleware,
  initiateLimiter,
  validate(initiatePaymentSchema),
  initiate,
);
router.post('/webhook/chapa', webhook);
router.get('/history', authMiddleware, getHistory);

export default router;
