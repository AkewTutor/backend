import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { rateLimiter } from '../middlewares/rateLimiter.middleware.js';
import { sendMessageSchema } from '../schemas/messaging.schema.js';
import { getThread, listMessages, sendMessage } from '../controllers/messaging.controller.js';

const router = Router();
router.use(authMiddleware);

router.get('/cohorts/:cohortId/thread', getThread);
router.get('/cohorts/:cohortId/messages', listMessages);
router.post(
  '/cohorts/:cohortId/messages',
  rateLimiter({ max: 30, windowMs: 60 * 1000 }), // 30 per minute
  validate(sendMessageSchema),
  sendMessage,
);

export default router;
