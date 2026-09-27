import { Router } from 'express';
import {
  fileComplaint,
  getMyComplaint,
  getSupportContact,
  listMyComplaints,
} from '../controllers/complaint.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import validateRequest from '../middlewares/validate.middleware.js';
import { createComplaintSchema } from '../schemas/complaint.schema.js';

export const complaintRouter = Router();
complaintRouter.use(authMiddleware);
complaintRouter.post('/', validateRequest(createComplaintSchema), fileComplaint);
complaintRouter.get('/me', listMyComplaints);
complaintRouter.get('/:complaintId', getMyComplaint);

export const supportRouter = Router();
supportRouter.get('/contact', getSupportContact);
