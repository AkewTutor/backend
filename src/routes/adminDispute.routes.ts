import { Router } from 'express';
import {
  getDisputeDetail,
  listQueue,
  resolveDispute,
} from '../controllers/adminDispute.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validateRequest from '../middlewares/validate.middleware.js';
import { resolveDisputeSchema } from '../schemas/complaint.schema.js';

export const adminDisputeRouter = Router();

adminDisputeRouter.use(authMiddleware, requireRole('ADMIN'));
adminDisputeRouter.get('/', listQueue);
adminDisputeRouter.get('/:complaintId', getDisputeDetail);
adminDisputeRouter.patch('/:complaintId', validateRequest(resolveDisputeSchema), resolveDispute);
