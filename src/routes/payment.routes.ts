import { Router } from 'express';
import { initiate, webhook, getHistory } from '../controllers/payment.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { initiatePaymentSchema } from '../schemas/payment.schema.js';
import rateLimit from 'express-rate-limit';

const PAYMENT_INITIATE_LIMIT = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }); // 10/hour

const router = Router();

router.post(
  '/initiate',
  authMiddleware,
  PAYMENT_INITIATE_LIMIT,
  validate(initiatePaymentSchema),
  initiate,
);
router.post('/webhook/chapa', webhook);
router.get('/history', authMiddleware, getHistory);

export default router;
