/**
 * tests/middlewares/error.middleware.test.ts
 *
 * Journey step 1.2. Spec: `09-1-shared-config.md` §9.3.
 * NFRs: NFR-007 (no internal detail leakage).
 * OWASP: A05:2021 – Security Misconfiguration,
 *        A09:2021 – Security Logging and Monitoring Failures.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/utils/logger.js', () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import logger from '../../src/utils/logger.js';
import errorMiddleware from '../../src/middlewares/error.middleware.js';
import ApiError from '../../src/utils/ApiError.js';

function mockReq(): Request {
  return { method: 'GET', path: '/api/v1/whatever' } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

const next = vi.fn();

describe('errorMiddleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('ApiError passed through — standard envelope with the original status/message/errors', () => {
    const err = new ApiError(404, 'Not found', []);
    const res = mockRes();

    errorMiddleware(err, mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0];
    expect(body.statusCode).toBe(404);
    expect(body.message).toBe('Not found');
    expect(body.errors).toEqual([]);
    expect(body.success).toBe(false);
  });

  it('ApiError with field errors — errors array passed through unchanged', () => {
    const fieldErrors = [{ field: 'email', message: 'Invalid email' }];
    const err = new ApiError(400, 'Validation failed', fieldErrors as any);
    const res = mockRes();

    errorMiddleware(err, mockReq(), res, next);

    const body = res.json.mock.calls[0][0];
    expect(body.errors).toEqual(fieldErrors);
  });

  it('unrecognized/unexpected error responds 500 with a generic message, never the raw message/stack', () => {
    const err = new TypeError("Cannot read property 'x' of undefined");
    const res = mockRes();

    errorMiddleware(err, mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.message).not.toContain("Cannot read property 'x' of undefined");
    expect(JSON.stringify(body)).not.toContain(err.stack ?? '__no_stack__');
  });

  it('unrecognized error is logged server-side even though withheld from the client', () => {
    const err = new Error('boom');
    const res = mockRes();

    errorMiddleware(err, mockReq(), res, next);

    expect(logger.error).toHaveBeenCalled();
    const loggedArgs = (logger.error as any).mock.calls[0];
    const loggedSomethingContainingTheError = loggedArgs.some(
      (arg: unknown) => arg === err || (arg && String(arg).includes('boom')),
    );
    expect(loggedSomethingContainingTheError).toBe(true);
  });

  it('a Zod-validation-shaped ApiError (from validate.middleware) surfaces 400 with per-field errors', () => {
    const err = new ApiError(400, 'Validation failed', ['email: Invalid email'] as any);
    const res = mockRes();

    errorMiddleware(err, mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.errors).toEqual(['email: Invalid email']);
  });

  it('no stack trace or raw Prisma error text ever reaches the client', () => {
    class PrismaClientKnownRequestError extends Error {
      code = 'P2002';
      meta = { target: ['email'], internalDetail: 'super-secret-table-name' };
    }
    const err = new PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`) table `public.User`',
    );
    const res = mockRes();

    errorMiddleware(err, mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    const bodyString = JSON.stringify(res.json.mock.calls[0][0]);
    expect(bodyString).not.toContain('P2002');
    expect(bodyString).not.toContain('super-secret-table-name');
    expect(bodyString).not.toContain('Unique constraint failed');
  });
});
