/**
 * tests/schemas/session.schema.test.ts
 *
 * Journey step 4.1. Spec: `09-4-class-delivery-library.md` §9.2.
 * FRs: FR-CD-003.
 *
 * Uses the real Zod schema (no mocking) — matches the shape validate.middleware.ts
 * wraps every request in: `{ body, params, query }`.
 */

import { describe, expect, it } from 'vitest';

import { provideJitsiLinkSchema } from '../../src/schemas/session.schema.js';

describe.skip('provideJitsiLinkSchema', () => {
  it('requires a valid URL — a non-URL string fails', () => {
    const result = provideJitsiLinkSchema.safeParse({ body: { jitsiLinkUrl: 'not-a-url' } });

    expect(result.success).toBe(false);
  });

  it('accepts a valid Jitsi URL', () => {
    const result = provideJitsiLinkSchema.safeParse({
      body: { jitsiLinkUrl: 'https://meet.jit.si/abc123' },
    });

    expect(result.success).toBe(true);
  });
});
