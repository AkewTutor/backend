import { Router } from 'express';
import {
  getActivity,
  getStats,
  getTutorPerformance,
} from '../controllers/adminReporting.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validateRequest from '../middlewares/validate.middleware.js';
import { getActivitySchema } from '../schemas/adminReporting.schema.js';

export const adminReportingRouter = Router();

adminReportingRouter.use(authMiddleware, requireRole('ADMIN'));

adminReportingRouter.get('/platform-health', getStats);
adminReportingRouter.get('/activity', validateRequest(getActivitySchema), getActivity);
adminReportingRouter.get('/tutor-performance', getTutorPerformance);
