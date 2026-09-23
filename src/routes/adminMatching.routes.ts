import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import * as adminMatchingController from '../controllers/adminMatching.controller.js';

const adminMatchingRouter = Router();

adminMatchingRouter.use(authMiddleware, requireRole('ADMIN'));

adminMatchingRouter.get('/queue', adminMatchingController.listQueue);
adminMatchingRouter.post('/:cohortId/approve', adminMatchingController.approve);
adminMatchingRouter.post('/:cohortId/reject', adminMatchingController.reject);
adminMatchingRouter.post('/manual-assign', adminMatchingController.manualAssign);

export { adminMatchingRouter };
export default adminMatchingRouter;
