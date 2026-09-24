import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { submitAssessmentSchema } from '../schemas/weeklyAssessment.schema.js';
import { submit, listForMembership } from '../controllers/weeklyAssessment.controller.js';

const router = Router();
router.use(authMiddleware);

router.post('/', validate(submitAssessmentSchema), submit);
router.get('/cohort-membership/:id', listForMembership);

export default router;
