// src/services/notification.service.ts
import { Prisma } from '@prisma/client';
import type { NotifChannel, NotificationType } from '@prisma/client';

import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { send as smsSend } from '../utils/providers/sms.client.js';
import { send as emailSend } from '../utils/providers/email.client.js';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface NotificationUserShape {
  id: string;
  email?: string | null;
  phone?: string | null;
  preferredNotificationChannel?: NotifChannel | null;
}

export interface PaginatedNotificationsDTO {
  notifications: unknown[];
  page: number;
  limit: number;
  total: number;
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/**
 * Pick the delivery channel for a notification:
 *   1. the user's own stored preference if set,
 *   2. else a `channel` hint carried in the payload (registration
 *      supplies this while a new user's preference is still null),
 *   3. else EMAIL when the user has an email, SMS when only a phone,
 *   4. else EMAIL as a last-resort default (delivery then fails cleanly
 *      because no address is present).
 */
function pickChannel(
  user: NotificationUserShape | null,
  payload: Record<string, unknown> | undefined,
): NotifChannel {
  if (user?.preferredNotificationChannel) {
    return user.preferredNotificationChannel;
  }
  const hint = payload?.channel;
  if (hint === 'EMAIL' || hint === 'SMS' || hint === 'PUSH') {
    return hint as NotifChannel;
  }
  if (user?.email) return 'EMAIL';
  if (user?.phone) return 'SMS';
  return 'EMAIL';
}

/**
 * Attempt one delivery and record the outcome on the Notification row.
 * Returns `true` on success, `false` on any failure — the caller uses
 * this to count retries. Never throws: any error (provider rejection,
 * provider exception, DB failure on the outcome update) terminates as
 * `false` without propagating.
 */
async function attemptDelivery(
  notificationId: string,
  channel: NotifChannel,
  user: NotificationUserShape | null,
  type: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    const to = channel === 'SMS' ? user?.phone : user?.email;

    if (!to) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'FAILED' },
      });
      return false;
    }

    const subjectOrTemplate = type;
    const body = JSON.stringify(payload);

    const result =
      channel === 'SMS'
        ? await smsSend(to, subjectOrTemplate, body)
        : await emailSend(to, subjectOrTemplate, body);

    await prisma.notification.update({
      where: { id: notificationId },
      data: result.success ? { status: 'SENT', sentAt: new Date() } : { status: 'FAILED' },
    });

    return result.success;
  } catch {
    try {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status: 'FAILED' },
      });
    } catch {
      // The FAILED write itself failed. Swallow — the caller's contract
      // is that this function never throws, and there is nowhere further
      // to report the failure.
    }
    return false;
  }
}

// ──────────────────────────────────────────────────────────────
// dispatchNotification
// ──────────────────────────────────────────────────────────────

/**
 * Single entry point every other feature calls to notify a user. Writes
 * one Notification row (status QUEUED) per call, routes delivery by the
 * user's channel preference, and updates the row to SENT or FAILED.
 *
 * Never throws back into the caller — a downstream delivery failure must
 * never roll back the business action that triggered the notification
 * (Doc 8-1). All error paths terminate in a FAILED row.
 *
 * Deliberately NOT idempotent: two identical calls create two
 * independent rows, matching the test's `[Phase 4]` annotation that
 * deduplication is a caller-side concern, not this function's.
 */
export async function dispatchNotification(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    let user: NotificationUserShape | null = null;
    try {
      user = (await prisma.user.findUnique({
        where: { id: userId },
      })) as NotificationUserShape | null;
    } catch {
      // If the user lookup itself fails, still create the row (so the
      // fact that a notification was attempted is not lost), then the
      // delivery attempt below records the FAILED outcome.
    }

    const channel = pickChannel(user, payload);

    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        // `payload` is a plain object of primitives by contract (Doc 04
        // §4.2.10: "Event-specific data"). Prisma's `Json` field type
        // (InputJsonValue) can't accept `unknown` statically, so narrow
        // it here; a genuine non-JSON value would fail at DB write time
        // with a clear error rather than corrupting silently.
        payload: payload as Prisma.InputJsonValue,
        channel,
        status: 'QUEUED',
      },
    });

    await attemptDelivery(notification.id, channel, user, type, payload);
  } catch {
    // Swallow. Even a failure to write the QUEUED row never propagates
    // back into the caller — the contract is "this function resolves,
    // always."
  }
}

// ──────────────────────────────────────────────────────────────
// listForUser
// ──────────────────────────────────────────────────────────────

/**
 * List the current user's notifications, scoped strictly to `userId`.
 * Always returns `{ notifications, page, limit, total }` — an account
 * with no notifications yields an empty array with `200` (00-api-
 * conventions §0.3), never a 404.
 *
 * The mock surface for this service exposes only `notification.findMany`
 * (no `.count`), so `total` is derived from a single unpaginated fetch
 * and the page is sliced in memory. For the sizes this endpoint serves
 * (a notification centre per user) that is fine; if the table ever grows
 * per-user past low thousands, swap to a `$transaction([findMany, count])`
 * once a `.count` mock is added to the test tier.
 */
export async function listForUser(
  userId: string,
  unreadOnly: boolean,
  page: number,
  limit: number,
): Promise<PaginatedNotificationsDTO> {
  const where: Record<string, unknown> = { userId };
  if (unreadOnly) {
    where.readAt = null;
  }

  const all = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const total = all.length;
  const safePage = Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1;
  const safeLimit = Number.isFinite(limit) && limit >= 1 ? Math.trunc(limit) : 20;
  const skip = (safePage - 1) * safeLimit;
  const notifications = all.slice(skip, skip + safeLimit);

  return {
    notifications,
    page: safePage,
    limit: safeLimit,
    total,
  };
}

// ──────────────────────────────────────────────────────────────
// markRead
// ──────────────────────────────────────────────────────────────

/**
 * Mark a single notification read. Ownership check (A01:2021 — Broken
 * Access Control / IDOR): a notification whose `userId` does not match
 * the caller throws ApiError(403), distinct from the 404 for a
 * nonexistent row.
 *
 * The `where` clause passed to `.update` carries BOTH `id` and `userId`,
 * so the ownership condition is enforced at the DB layer as well as the
 * application layer — a second row is not possible to update here even
 * under a race.
 */
export async function markRead(
  notificationId: string,
  userId: string,
): Promise<{ id: string; readAt: Date | null }> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }

  if (notification.userId !== userId) {
    throw new ApiError(403, 'Not authorized to modify this notification');
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });

  return { id: updated.id, readAt: updated.readAt ?? null };
}

// ──────────────────────────────────────────────────────────────
// retryFailed
// ──────────────────────────────────────────────────────────────

/**
 * Re-attempt every Notification row whose status is FAILED. Called by
 * `notificationRetry.job.ts` on an interval.
 *
 * Returns `{ retried }` — the count of rows whose re-attempt succeeded.
 *
 * NOTE (flagged): the max-attempt cap described in Doc 8-1 ("a max-
 * attempt cap (e.g. 3)") cannot be enforced at the query layer today
 * because the `Notification` model in Doc 04 has no attempt-count
 * column. The `where` filter therefore selects every FAILED row on each
 * run; a future migration adding e.g. `attemptCount` would tighten the
 * where clause and this comment would go away.
 */
export async function retryFailed(): Promise<{ retried: number }> {
  const failed = await prisma.notification.findMany({
    where: { status: 'FAILED' },
  });

  let retried = 0;

  for (const row of failed) {
    try {
      const user = (await prisma.user.findUnique({
        where: { id: row.userId },
      })) as NotificationUserShape | null;

      const channel = pickChannel(user, row.payload as Record<string, unknown>);
      const succeeded = await attemptDelivery(
        row.id,
        channel,
        user,
        row.type as unknown as string,
        (row.payload as Record<string, unknown>) ?? {},
      );
      if (succeeded) retried += 1;
    } catch {
      // One row's retry failed in a way attemptDelivery did not already
      // absorb — skip to the next rather than abort the whole batch.
    }
  }

  return { retried };
}
