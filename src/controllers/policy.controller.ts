// src/controllers/policy.controller.ts
import type { NextFunction, Request, Response } from 'express';

import * as policyService from '../services/policy.service.js';
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
 * Public read of the current policy version for a given type.
 *
 * `req.params.type` is typed `string | string[]` in Express 5's
 * typedefs (route params can be arrays for wildcards); the `:type`
 * route is single-segment, so `String(...)` is a runtime no-op that
 * satisfies the compiler. The schema layer has already validated the
 * value against the policy-type enum by the time this handler runs on
 * the route tier; on the unit tier the controller receives whatever
 * the test passes and forwards it — the service re-validates either way.
 */
export async function getPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await policyService.getCurrentPolicy(String(req.params.type) as never);
    send(res, 200, result);
  } catch (err) {
    next(err);
  }
}

/**
 * Admin-only publish. The publisher is taken from `req.user.id`, never
 * from the request body — a client cannot attribute a policy to another
 * admin even if it injects a `publishedById` field. Content comes from
 * the body; type comes from the path param.
 */
export async function publishPolicy(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const type = String(req.params.type) as never;
    const content = req.body.content;
    const publisherId = (req as AuthRequest).user?.id as string;

    const result = await policyService.publishNewVersion(type, content, publisherId);

    send(res, 201, result);
  } catch (err) {
    next(err);
  }
}
