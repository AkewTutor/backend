/**
 * tests/middlewares/validate.middleware.test.ts
 *
 * Journey step 1.3. Spec: `09-1-shared-config.md` §9.4.
 * NFRs: NFR-007.
 * OWASP: A03:2021 – Injection.
 *
 * Uses real Zod schemas (no mocking) — validate.middleware.ts's job is
 * proven against actual Zod parsing behavior, not a stand-in.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';

import validate from '../../src/middlewares/validate.middleware.js';
import ApiError from '../../src/utils/ApiError.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes(): Response {
  return {} as Response;
}

describe('validate.middleware.ts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('valid body passes through — next() called, req.body is the parsed result', async () => {
    const schema = z.object({ body: z.object({ email: z.string().email() }) });
    const req = mockReq({ body: { email: 'user@example.com' } });
    const next = vi.fn();

    await validate(schema)(req, mockRes(), next as NextFunction);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ email: 'user@example.com' });
  });

  it('invalid body throws 400 with field errors — one entry per failed field', async () => {
    const schema = z.object({ body: z.object({ email: z.string().email() }) });
    const req = mockReq({ body: { email: 'not-an-email' } });
    const next = vi.fn();

    await validate(schema)(req, mockRes(), next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('multiple simultaneous field failures produce multiple error entries, not just the first', async () => {
    const schema = z.object({
      body: z.object({ email: z.string().email(), password: z.string().min(8) }),
    });
    const req = mockReq({ body: { email: 'not-an-email', password: 'x' } });
    const next = vi.fn();

    await validate(schema)(req, mockRes(), next as NextFunction);

    const err = next.mock.calls[0][0];
    expect(err.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('query/params are validated independently of body — an invalid params.id is caught with a valid body', async () => {
    const schema = z.object({
      body: z.object({ note: z.string().optional() }),
      params: z.object({ id: z.string().uuid() }),
    });
    const req = mockReq({ body: {}, params: { id: 'not-a-uuid' } });
    const next = vi.fn();

    await validate(schema)(req, mockRes(), next as NextFunction);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
  });

  it('unknown/extra fields are stripped, not silently accepted (mass-assignment guard)', async () => {
    const schema = z.object({ body: z.object({ email: z.string() }) });
    const req = mockReq({ body: { email: 'a@b.com', role: 'ADMIN' } });
    const next = vi.fn();

    await validate(schema)(req, mockRes(), next as NextFunction);

    if (next.mock.calls[0][0] instanceof ApiError) {
      // Rejected outright (a .strict() schema) — also an acceptable guard.
      expect((next.mock.calls[0][0] as ApiError).statusCode).toBe(400);
    } else {
      // Zod's default object parsing strips unrecognized keys.
      expect(req.body).not.toHaveProperty('role');
      expect((req.body as any).email).toBe('a@b.com');
    }
  });

  it('oversized payload against a .max()-constrained schema is rejected without crashing the process', async () => {
    const schema = z.object({ body: z.object({ content: z.string().min(1).max(1000) }) });
    const hugeString = 'a'.repeat(5_000_000);
    const req = mockReq({ body: { content: hugeString } });
    const next = vi.fn();

    await expect(validate(schema)(req, mockRes(), next as NextFunction)).resolves.not.toThrow();

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
  });
});
