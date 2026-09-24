import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import { viewThread, closeThread } from '../controllers/adminMessaging.controller.js';

const router = Router();
router.use(authMiddleware, requireRole('ADMIN'));

router.get('/threads/:threadId', viewThread);
router.post('/threads/:threadId/close', closeThread);

export default router;
