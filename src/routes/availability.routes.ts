import { Router } from 'express';
import * as availabilityController from '../controllers/availability.controller.js';
import validate from '../middlewares/validate.middleware.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import { createSlotSchema, deleteSlotSchema } from '../schemas/availability.schema.js';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('TUTOR'));

router.get('/me/availability', availabilityController.listSlots);
router.post('/me/availability', validate(createSlotSchema), availabilityController.setSlots);
router.delete(
  '/me/availability/:slotId',
  validate(deleteSlotSchema),
  availabilityController.removeSlot,
);

export default router;
