import { Router } from 'express';
import {
  getMyProfile,
  updateBasicProfile,
  updateAcademicProfile,
} from '../controllers/studentProfile.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { updateAcademicProfileSchema } from '../schemas/studentProfile.schema.js';

const router = Router();

router.use(authMiddleware);

router.get('/me/profile', getMyProfile);
router.patch('/me/profile', updateBasicProfile);
router.patch('/me/academic-profile', validate(updateAcademicProfileSchema), updateAcademicProfile);

export default router;
