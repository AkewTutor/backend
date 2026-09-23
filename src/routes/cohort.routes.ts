import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import * as cohortController from '../controllers/cohort.controller.js';

const cohortRouter = Router();

cohortRouter.use(authMiddleware);

cohortRouter.get('/me', cohortController.getMyCohort);
cohortRouter.get('/:cohortId/members', cohortController.getCohortMembers);

export { cohortRouter };
export default cohortRouter;
