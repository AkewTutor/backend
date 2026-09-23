import { Router } from 'express';
import { listPending, approve, reject } from '../controllers/adminTutorVerification.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));

router.get('/pending', listPending);
router.post('/:tutorId/approve', approve);
router.post('/:tutorId/reject', reject);

export default router;
