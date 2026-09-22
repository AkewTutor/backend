// src/routes/notification.routes.ts
import { Router } from 'express';

import * as controller from '../controllers/notification.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { listNotificationsQuerySchema } from '../schemas/notification.schema.js';

export const notificationRouter = Router();

notificationRouter.get(
  '/',
  authMiddleware,
  validate(listNotificationsQuerySchema),
  controller.listMyNotifications,
);

notificationRouter.patch('/:id/read', authMiddleware, controller.markAsRead);
