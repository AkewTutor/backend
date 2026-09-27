import { Router } from 'express';
import { adminReview, adminApprove, adminReject } from '../controllers/refund.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { rejectRefundSchema } from '../schemas/refund.schema.js';

export const adminRefundRouter = Router();

adminRefundRouter.use(authMiddleware, requireRole('ADMIN'));

adminRefundRouter.get('/', adminReview);
adminRefundRouter.post('/:refundId/approve', adminApprove);
adminRefundRouter.post('/:refundId/reject', validate(rejectRefundSchema), adminReject);
