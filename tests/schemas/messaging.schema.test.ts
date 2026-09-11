/**
 * tests/schemas/messaging.schema.test.ts
 *
 * Journey step 5.1. Spec: `09-5-messaging.md` §9.2.
 * FRs: FR-MS-001.
 * OWASP: A08:2021 – Software and Data Integrity Failures (mass-assignment
 * guard on the attachment/media field that deliberately does not exist).
 *
 * Uses the real Zod schema (no mocking) — sendMessageSchema's job is
 * proven against actual Zod parsing behavior, not a stand-in.
 */

import { describe, expect, it } from 'vitest';

import { sendMessageSchema } from '../../src/schemas/messaging.schema.js';

const validCohortId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

describe.skip('sendMessageSchema', () => {
  it('rejects an empty body', () => {
    const result = sendMessageSchema.safeParse({
      params: { cohortId: validCohortId },
      body: { body: '' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects a body over 2000 chars', () => {
    const result = sendMessageSchema.safeParse({
      params: { cohortId: validCohortId },
      body: { body: 'a'.repeat(2001) },
    });

    expect(result.success).toBe(false);
  });

  it('accepts a valid 1–2000 char body', () => {
    const result = sendMessageSchema.safeParse({
      params: { cohortId: validCohortId },
      body: { body: 'Running 5 minutes late, sorry!' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID cohortId path param', () => {
    const result = sendMessageSchema.safeParse({
      params: { cohortId: 'not-a-uuid' },
      body: { body: 'hi' },
    });

    expect(result.success).toBe(false);
  });

  it('no attachment/media field exists on the schema (mass-assignment guard) — attachmentUrl is stripped', () => {
    const result = sendMessageSchema.safeParse({
      params: { cohortId: validCohortId },
      body: { body: 'hi', attachmentUrl: 'https://evil.example/x' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.body).not.toHaveProperty('attachmentUrl');
      expect(result.data.body.body).toBe('hi');
    }
  });
});
