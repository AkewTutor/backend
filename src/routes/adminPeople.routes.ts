import { Router } from 'express';
import {
  listUsers,
  manageRelationshipRecords,
  suspendAccount,
  reactivateAccount,
} from '../controllers/adminPeople.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));

router.get('/', listUsers);
router.patch('/relationships/:relationshipId', manageRelationshipRecords);
router.post('/:userId/suspend', suspendAccount);
router.post('/:userId/reactivate', reactivateAccount);

export default router;
