import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { requestFormatSwitchSchema } from '../schemas/formatSwitch.schema.js';
import * as formatSwitchController from '../controllers/formatSwitch.controller.js';

const formatSwitchRouter = Router();

formatSwitchRouter.use(authMiddleware);

formatSwitchRouter.post(
  '/',
  validate(requestFormatSwitchSchema),
  formatSwitchController.requestSwitch,
);

export { formatSwitchRouter };
export default formatSwitchRouter;
