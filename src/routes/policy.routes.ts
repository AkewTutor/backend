// src/routes/policy.routes.ts
import { Router } from 'express';

import * as controller from '../controllers/policy.controller.js';
import authMiddleware, { requireRole } from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import { getPolicySchema, publishPolicySchema } from '../schemas/policy.schema.js';

/**
 * Mounted at `/policies`. The public GET and the admin POST share the
 * same path prefix and the same `:type` path param — access is
 * separated by the middleware chain (POST requires auth + ADMIN role),
 * not by path.
 *
 * NOTE (flagged): Doc 01 §0.7 / Doc 05a §1 describe the admin publish
 * path as `POST /admin/policies`, but the route tests exercise
 * `POST /api/v1/policies/:type`. Tests are authoritative (working-
 * context §2 / Rule 1), so the path here is `/policies/:type` for both
 * methods. If you also need `/admin/policies` as a mount alias for
 * doc compliance, mount this same router there too — the routes
 * themselves are identical.
 */
export const policyRouter = Router();

policyRouter.get('/:type', validate(getPolicySchema), controller.getPolicy);

policyRouter.post(
  '/:type',
  authMiddleware,
  requireRole('ADMIN'),
  validate(publishPolicySchema),
  controller.publishPolicy,
);
