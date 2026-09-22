// src/controllers/notification.controller.ts
import type { NextFunction, Request, Response } from 'express';

import * as notificationService from '../services/notification.service.js';
import type { AuthRequest } from '../types/index.js';

function send(res: Response, statusCode: number, data: unknown): void {
  res.status(statusCode).json({
    statusCode,
    success: true,
    message: 'OK',
    data,
  });
}

/**
 * Query values may arrive either as raw strings (no `validate` middleware
 * in the unit test tier) or as already-coerced primitives (after
 * `validate(listNotificationsQuerySchema)` in the route tier). Normalise
 * both here — `unreadOnly` to a boolean, `page`/`limit` to finite
 * positive integers with defaults — so `listForUser` is always called
 * with defined values.
 */
function coerceQuery(raw: unknown): {
  unreadOnly: boolean;
  page: number;
  limit: number;
} {
  const q = (raw ?? {}) as Record<string, unknown>;
  const unreadOnly = q.unreadOnly === true || q.unreadOnly === 'true';
  const pageNum = Number(q.page);
  const limitNum = Number(q.limit);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.trunc(pageNum) : 1;
  const limit = Number.isFinite(limitNum) && limitNum >= 1 ? Math.trunc(limitNum) : 20;
  return { unreadOnly, page, limit };
}

/**
 * Delegates with the caller's own id — the `userId` in the query string
 * (if any) is deliberately ignored, so a client cannot list another
 * user's notifications.
 */
export async function listMyNotifications(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = (req as AuthRequest).user?.id as string;
    const { unreadOnly, page, limit } = coerceQuery(req.query);

    const result = await notificationService.listForUser(userId, unreadOnly, page, limit);

    send(res, 200, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Delegates to markRead with the path param id and the caller's own id.
 * The service enforces the ownership check (403 vs. 404); both
 * propagate unchanged.
 *
 * `req.params.id` is typed `string | string[]` in Express 5's typedefs
 * (a route param may be an array for wildcard segments). The `:id`
 * route is a single-segment param, so the value is always a string at
 * runtime; `String(...)` satisfies the type without a cast.
 */
export async function markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as AuthRequest).user?.id as string;
    const result = await notificationService.markRead(String(req.params.id), userId);
    send(res, 200, result);
  } catch (err) {
    next(err);
  }
}
