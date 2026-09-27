import { Router } from 'express';
import { adminList, adminMarkPaid } from '../controllers/payout.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';

export const adminPayoutRouter = Router();

adminPayoutRouter.use(authMiddleware, requireRole('ADMIN'));

adminPayoutRouter.get('/', adminList);
adminPayoutRouter.post('/:payoutId/mark-paid', adminMarkPaid);
