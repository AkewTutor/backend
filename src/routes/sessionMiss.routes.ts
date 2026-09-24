import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import { listMisses, reportMiss } from '../controllers/sessionMiss.controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/', listMisses);

router.post('/', requireRole('ADMIN'), reportMiss);

export default router;
