import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import { uploadMaterialSchema } from '../schemas/library.schema.js';
import { remove as removeController } from '../controllers/library.controller.js';
import {
  upload as uploadController,
  listForCohort,
  adminOverride,
  adminRecordingCompliance,
} from '../controllers/library.controller.js';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXT = /\.(pdf|doc|docx|jpe?g|png|webp|mp4|webm|mov)$/i;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXT.test(file.originalname) || !ALLOWED_MIME.has(file.mimetype)) {
      cb(
        new ApiError(
          400,
          'Unsupported file type. Allowed: PDF, DOC, DOCX, JPG, PNG, WEBP, MP4, WEBM, MOV',
        ),
      );
      return;
    }
    cb(null, true);
  },
});

const uploadMaterialFile = (req: any, res: any, next: any) => {
  uploadMiddleware.single('file')(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(413, 'File too large (max 10 MB, or 100 MB for video)'));
    }
    return next(err);
  });
};

export const libraryRouter = Router();
libraryRouter.use(authMiddleware);
libraryRouter.post(
  '/materials',
  uploadMaterialFile,
  validate(uploadMaterialSchema),
  uploadController,
);
libraryRouter.get('/cohorts/:cohortId/materials', listForCohort);
libraryRouter.delete('/materials/:id', requireRole('TUTOR'), removeController);

export const adminLibraryRouter = Router();
adminLibraryRouter.use(authMiddleware, requireRole('ADMIN'));
adminLibraryRouter.patch('/materials/:id', adminOverride);
adminLibraryRouter.get('/recording-compliance', adminRecordingCompliance);
