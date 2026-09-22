// src/schemas/notification.schema.ts
import { z } from 'zod';

/**
 * Query schema for GET /notifications.
 *
 * The shared `validate` middleware writes the parsed `query` back to
 * `req.query` (`if (data.query) req.query = data.query;`), which throws
 * in Express 5 because `req.query` is a getter-only accessor — the
 * resulting TypeError is caught by the middleware's try/catch and
 * surfaced as a 500 rather than a validation error.
 *
 * The controller re-coerces query values via `coerceQuery()`, so the
 * parsed values are not needed downstream. This `.transform(() =>
 * undefined)` discards the parsed object *after* validation runs, which
 * makes `data.query` falsy in the middleware and skips the problematic
 * assignment. Validation still fires — a malformed `limit` is still
 * rejected with a 400 before the transform runs.
 */
export const listNotificationsQuerySchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      unreadOnly: z.coerce.boolean().default(false),
    })
    .transform(() => undefined),
});
