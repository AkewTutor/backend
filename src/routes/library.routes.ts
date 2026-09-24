import { Router } from 'express';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import multer from 'multer';
import { uploadMaterialSchema } from '../schemas/library.schema.js';
import {
  upload as uploadController,
  listForCohort,
  adminOverride,
  adminRecordingCompliance,
} from '../controllers/library.controller.js';

const uploadMiddleware = multer({ storage: multer.memoryStorage() });

export const libraryRouter = Router();
libraryRouter.use(authMiddleware);
libraryRouter.post(
  '/materials',
  uploadMiddleware.single('file'),
  validate(uploadMaterialSchema),
  uploadController,
);
libraryRouter.get('/cohorts/:cohortId/materials', listForCohort);

export const adminLibraryRouter = Router();
adminLibraryRouter.use(authMiddleware, requireRole('ADMIN'));
adminLibraryRouter.patch('/materials/:id', adminOverride);
adminLibraryRouter.get('/recording-compliance', adminRecordingCompliance);
