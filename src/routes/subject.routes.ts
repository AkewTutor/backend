import { Router } from 'express';
import * as subjectController from '../controllers/subject.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';

export const subjectRouter = Router();
subjectRouter.get('/', subjectController.listSubjects);

export const adminSubjectRouter = Router();
adminSubjectRouter.use(authMiddleware);
adminSubjectRouter.use(requireRole('ADMIN'));
adminSubjectRouter.post('/', subjectController.createSubject);
adminSubjectRouter.patch('/:id', subjectController.deactivateSubject);
