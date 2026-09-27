import { Router } from 'express';
import { getPauseStatus } from '../controllers/paymentPause.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/status', getPauseStatus);

export default router;
