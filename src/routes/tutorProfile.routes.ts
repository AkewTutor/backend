import { Router } from 'express';
import * as tutorProfileController from '../controllers/tutorProfile.controller.js';
import validate from '../middlewares/validate.middleware.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import { rankSubjectsSchema, updateTutorProfileSchema } from '../schemas/tutorProfile.schema.js';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('TUTOR'));

router.get('/me/profile', tutorProfileController.getProfile);
router.patch(
  '/me/profile',
  validate(updateTutorProfileSchema),
  tutorProfileController.updateProfile,
);
router.post('/me/resubmit-verification', tutorProfileController.resubmitVerification);
router.put('/me/subjects', validate(rankSubjectsSchema), tutorProfileController.rankSubjects);

export default router;
