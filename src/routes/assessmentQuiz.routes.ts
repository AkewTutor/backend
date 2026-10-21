import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import {
  createQuizSchema,
  updateQuizSchema,
  quizIdParamSchema,
  attemptIdParamSchema,
  submitAttemptSchema,
} from '../schemas/assessmentQuiz.schema.js';
import {
  createQuiz,
  updateQuiz,
  deleteQuiz,
  resetAttempt,
  listForCohort,
  submitAttempt,
} from '../controllers/assessmentQuiz.controller.js';

const router = Router();
router.use(authMiddleware);

router.post('/', requireRole('TUTOR'), validate(createQuizSchema), createQuiz);
router.get('/cohort/:cohortId', requireRole('TUTOR', 'STUDENT'), listForCohort);
router.post(
  '/attempts/:attemptId/reset',
  requireRole('TUTOR'),
  validate(attemptIdParamSchema),
  resetAttempt,
);
router.post(
  '/:quizId/attempts',
  requireRole('STUDENT'),
  validate(submitAttemptSchema),
  submitAttempt,
);
router.patch('/:quizId', requireRole('TUTOR'), validate(updateQuizSchema), updateQuiz);
router.delete('/:quizId', requireRole('TUTOR'), validate(quizIdParamSchema), deleteQuiz);

export default router;
