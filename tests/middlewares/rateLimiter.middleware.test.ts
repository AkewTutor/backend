/**
 * tests/middlewares/rateLimiter.middleware.test.ts
 *
 * Journey step 1.4. Spec: `09-1-shared-config.md` §9.8 ("rateLimiter.middleware.ts"
 * subsection), `8-1-shared-config.md` (`rateLimiter(config: RateLimitConfig)`).
 * NFRs: NFR-013.
 *
 * Exercises the real in-memory `express-rate-limit` store directly, with a
 * small windowMs/max per case so assertions run fast and deterministically
 * — per-process counter correctness under production/horizontal-scale load
 * is explicitly out of scope here (see 9-1 §9.19).
 */

import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { rateLimiter } from '../../src/middlewares/rateLimiter.middleware.js';
import ApiError from '../../src/utils/ApiError.js';

function mockReq(key: string): Request {
  return {
    ip: key,
    headers: {},
    body: {},
    query: {},
    params: {},
  } as unknown as Request;
}

function mockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  res.getHeader = vi.fn();
  return res as Response;
}

describe('rateLimiter.middleware.ts', async () => {
  it('under the configured limit passes through — next() called, no response sent', async () => {
    const middleware = rateLimiter({
      windowMs: 60_000,
      max: 3,
      keyGenerator: (req: Request) => req.ip as string,
    });
    const req = mockReq('under-limit-key');
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next as NextFunction);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('exceeding the configured limit returns ApiError(429) via the standard error envelope', async () => {
    const middleware = rateLimiter({
      windowMs: 60_000,
      max: 1,
      keyGenerator: (req: Request) => req.ip as string,
    });
    const key = 'over-limit-key';

    // First request consumes the single allowed slot.
    await middleware(mockReq(key), mockRes(), vi.fn() as unknown as NextFunction);

    // Second request against the same key should be blocked.
    const res = mockRes();
    const next = vi.fn();
    await middleware(mockReq(key), res, next as NextFunction);

    const blockedByResponse = res.status.mock.calls.some((c: any[]) => c[0] === 429);
    const blockedByNext =
      next.mock.calls.length > 0 &&
      next.mock.calls[0][0] instanceof ApiError &&
      (next.mock.calls[0][0] as ApiError).statusCode === 429;

    expect(blockedByResponse || blockedByNext).toBe(true);
    if (blockedByResponse) {
      const body = res.json.mock.calls.find((c: any[]) => true)?.[0];
      expect(body?.message).toBe('Too many requests, please try again later');
    }
  });

  it('distinct keys do not interfere with each other', async () => {
    const middleware = rateLimiter({
      windowMs: 60_000,
      max: 1,
      keyGenerator: (req: Request) => req.ip as string,
    });

    // Exhaust the limit for key A.
    await middleware(mockReq('key-a'), mockRes(), vi.fn() as unknown as NextFunction);
    const resA = mockRes();
    const nextA = vi.fn();
    await middleware(mockReq('key-a'), resA, nextA as NextFunction);

    // Key B, never seen before, should still pass through.
    const resB = mockRes();
    const nextB = vi.fn();
    await middleware(mockReq('key-b'), resB, nextB as NextFunction);

    expect(nextB).toHaveBeenCalled();
    expect(resB.status).not.toHaveBeenCalledWith(429);
  });
});
