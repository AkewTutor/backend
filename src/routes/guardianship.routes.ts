import { Router } from 'express';
import * as guardianshipController from '../controllers/guardianship.controller.js';
import validate from '../middlewares/validate.middleware.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import {
  addStudentSchema,
  inviteGuardianSchema,
  revokeRelationshipSchema,
  activateInviteSchema,
} from '../schemas/guardianship.schema.js';

const router = Router();

router.post(
  '/invites/:token/activate',
  validate(activateInviteSchema),
  guardianshipController.activateInvite,
);

router.use(authMiddleware);

router.post(
  '/students',
  requireRole('PARENT'),
  validate(addStudentSchema),
  guardianshipController.addStudentAndInvite,
);
router.post(
  '/guardian-invites',
  requireRole('STUDENT'),
  validate(inviteGuardianSchema),
  guardianshipController.inviteOptionalGuardian,
);
router.patch(
  '/relationships/:id/revoke',
  validate(revokeRelationshipSchema),
  guardianshipController.revokeRelationship,
);
router.post('/invites/:id/resend', guardianshipController.resendInvite);

export default router;
