import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requestRescheduleSchema } from '../schemas/reschedule.schema.js';
import { requestReschedule } from '../controllers/reschedule.controller.js';

const router = Router();
router.use(authMiddleware);

router.post('/', validate(requestRescheduleSchema), requestReschedule);

export default router;
