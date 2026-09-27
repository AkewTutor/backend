import { Router } from 'express';
import { getMyEarnings } from '../controllers/earning.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';

const earningRouter = Router();

earningRouter.use(authMiddleware);

earningRouter.get('/me/earnings', getMyEarnings);

export default earningRouter;
