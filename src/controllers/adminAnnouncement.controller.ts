// src/controllers/adminAnnouncement.controller.ts
import type { NextFunction, Request, Response } from 'express';

import * as adminAnnouncementService from '../services/adminAnnouncement.service.js';
import type { AuthRequest } from '../types/index.js';

function send(res: Response, statusCode: number, data: unknown): void {
  res.status(statusCode).json({
    statusCode,
    success: true,
    message: 'OK',
    data,
  });
}

function coerceQuery(raw: unknown): { page: number; limit: number } {
  const q = (raw ?? {}) as Record<string, unknown>;
  const pageNum = Number(q.page);
  const limitNum = Number(q.limit);
  return {
    page: Number.isFinite(pageNum) && pageNum >= 1 ? Math.trunc(pageNum) : 1,
    limit: Number.isFinite(limitNum) && limitNum >= 1 ? Math.trunc(limitNum) : 20,
  };
}

/**
 * Creates an announcement. The `createdById` is taken from
 * `req.user.id` — never from the request body — so a client cannot
 * attribute the announcement to another admin. The body's `title`,
 * `body`, and `audienceRoles` are passed through; any other keys are
 * ignored.
 */
export async function createAnnouncement(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const createdById = (req as AuthRequest).user?.id as string;
    const { title, body, audienceRoles } = req.body;

    const result = await adminAnnouncementService.composePlatformAnnouncement(
      title,
      body,
      audienceRoles,
      createdById,
    );

    send(res, 201, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Lists previously sent announcements, paginated. Query values arrive as
 * strings (no validate middleware on this route); coerce to numbers with
 * the standard defaults (00-api-conventions §0.6).
 */
export async function listAnnouncements(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { page, limit } = coerceQuery(req.query);
    const result = await adminAnnouncementService.adjustNotificationRules(page, limit);
    send(res, 200, result);
  } catch (err) {
    next(err);
  }
}
