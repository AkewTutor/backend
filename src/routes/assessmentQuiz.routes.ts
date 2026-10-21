import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { createQuizSchema, submitAttemptSchema } from '../schemas/assessmentQuiz.schema.js';
import {
  createQuiz,
  listForCohort,
  submitAttempt,
} from '../controllers/assessmentQuiz.controller.js';

const router = Router();
router.use(authMiddleware);

router.post('/', requireRole('TUTOR'), validate(createQuizSchema), createQuiz);
router.get('/cohort/:cohortId', requireRole('TUTOR', 'STUDENT'), listForCohort);
router.post(
  '/:quizId/attempts',
  requireRole('STUDENT'),
  validate(submitAttemptSchema),
  submitAttempt,
);

export default router;
