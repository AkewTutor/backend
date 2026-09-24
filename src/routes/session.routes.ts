import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { provideJitsiLinkSchema } from '../schemas/session.schema.js';
import {
  listMySessions,
  getSession,
  provideLink,
  completeSession,
} from '../controllers/session.controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/', listMySessions);
router.get('/:sessionId', getSession);

router.post(
  '/:sessionId/link',
  requireRole('TUTOR'),
  validate(provideJitsiLinkSchema),
  provideLink,
);

router.post('/:sessionId/complete', requireRole('TUTOR'), completeSession);

export default router;
