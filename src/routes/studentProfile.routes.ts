import { Router } from 'express';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import {
  getMyProfile,
  updateBasicProfile,
  updateAcademicProfile,
  uploadProfilePicture,
} from '../controllers/studentProfile.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { updateAcademicProfileSchema } from '../schemas/studentProfile.schema.js';

const router = Router();

const pictureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});
const singlePicture = (req: any, res: any, next: any) =>
  pictureUpload.single('file')(req, res, (err: unknown) =>
    err ? next(new ApiError(400, 'Image must be a JPG, PNG or WebP of 2 MB or less')) : next(),
  );

router.use(authMiddleware);

router.get('/me/profile', getMyProfile);
router.patch('/me/profile', updateBasicProfile);
router.patch('/me/academic-profile', validate(updateAcademicProfileSchema), updateAcademicProfile);

router.post('/me/profile-picture', singlePicture, uploadProfilePicture);

export default router;
