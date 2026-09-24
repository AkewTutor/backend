import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { acknowledgeConsentSchema } from '../schemas/recordingConsent.schema.js';
import { getStatus, acknowledge } from '../controllers/recordingConsent.controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/status', getStatus);

router.post('/acknowledge', validate(acknowledgeConsentSchema), acknowledge);

export default router;
