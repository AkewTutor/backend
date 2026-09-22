// src/services/adminAnnouncement.service.ts
import type { UserRole } from '@prisma/client';

import { prisma } from '../config/db.js';
import { dispatchNotification } from './notification.service.js';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface AnnouncementDTO {
  id: string;
  title: string;
  body: string;
  audienceRoles: UserRole[];
  createdById: string;
  createdAt: Date;
}

export interface PaginatedAnnouncementsDTO {
  items: unknown[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Fan-out batch size. Doc 8-1 asks for batching (chunks of a few
 * hundred) rather than a single Promise.all over thousands of users.
 * 100 is a conservative default that keeps concurrent provider calls
 * bounded while staying fast for realistically sized audiences.
 */
const FANOUT_CHUNK_SIZE = 100;

// ──────────────────────────────────────────────────────────────
// composePlatformAnnouncement
// ──────────────────────────────────────────────────────────────

/**
 * Compose and send a platform-wide announcement (FR-AD-019, UC-89).
 *
 * Persists one Announcement row (the metadata record the admin listing
 * reads back), then dispatches one Notification row per User whose role
 * is in `audienceRoles`, through the same dispatchNotification pipeline
 * every other notification type uses.
 *
 * The `createdById` argument is supplied by the controller from
 * `req.user.id` — never read from the request body, so an admin cannot
 * attribute an announcement to another admin.
 */
export async function composePlatformAnnouncement(
  title: string,
  body: string,
  audienceRoles: UserRole[],
  createdById: string,
): Promise<AnnouncementDTO> {
  const announcement = (await prisma.announcement.create({
    data: { title, body, audienceRoles, createdById },
  })) as AnnouncementDTO;

  // Empty audience short-circuits naturally — findMany returns [], the
  // loop body never runs, and the created Announcement is still returned.
  const users = await prisma.user.findMany({
    where: { role: { in: audienceRoles } },
  });

  // Chunked fan-out: dispatchNotification must never throw (it swallows
  // internally), so no per-call error handling is needed here; the
  // `.catch` is defensive only.
  for (let i = 0; i < users.length; i += FANOUT_CHUNK_SIZE) {
    const chunk = users.slice(i, i + FANOUT_CHUNK_SIZE);
    await Promise.all(
      chunk.map((user) =>
        dispatchNotification(user.id, 'PLATFORM_ANNOUNCEMENT', {
          announcementId: announcement.id,
          title,
          body,
        }).catch(() => undefined),
      ),
    );
  }

  return announcement;
}

// ──────────────────────────────────────────────────────────────
// adjustNotificationRules (list announcements)
// ──────────────────────────────────────────────────────────────

/**
 * List previously sent announcements, paginated (UC-89,
 * GET /admin/announcements).
 *
 * NOTE (flagged, not silently renamed): Doc 05a §1 names this function
 * `adjustNotificationRules`, but the API contract it serves per
 * Doc 01 §"GET /admin/announcements" is a plain paginated read — there
 * is no "notification rules" configuration surface anywhere in
 * Docs 01–04. Doc 8-1 itself flags this mismatch. Implementing the
 * read the API contract requires, keeping the name Doc 05a pinned so
 * the controller's import matches.
 */
export async function adjustNotificationRules(
  page: number,
  limit: number,
): Promise<PaginatedAnnouncementsDTO> {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit >= 1 ? Math.trunc(limit) : 20;
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      skip,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.announcement.count(),
  ]);

  return { items, page: safePage, limit: safeLimit, total };
}
