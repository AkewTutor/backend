import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import multer from 'multer';
import {
  upload as uploadController,
  getMyRecordings,
  getSignedUrl,
  keepPermanently,
} from '../controllers/recording.controller.js';

const router = Router();
const uploadMiddleware = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

router.post('/', uploadMiddleware.single('file'), uploadController);
router.get('/me', getMyRecordings);
router.get('/:recordingId/signed-url', getSignedUrl);
router.post('/:recordingId/keep-permanently', keepPermanently);

export default router;
