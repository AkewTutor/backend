/**
 * tests/schemas/guardianship.schema.test.ts
 *
 * Journey step 2.5. Spec: `09-2-accounts-guardianship.md` §9.5.
 *
 * Uses the real Zod schemas (no mocking).
 */

import { describe, expect, it } from 'vitest';

import {
  addStudentSchema,
  inviteGuardianSchema,
  revokeRelationshipSchema,
} from '../../src/schemas/guardianship.schema.js';

describe.skip('addStudentSchema', () => {
  it('requires grade in 1–12 — grade 0 fails', () => {
    const result = addStudentSchema.safeParse({ body: { grade: 0, inviteContact: 'a@b.com' } });

    expect(result.success).toBe(false);
  });

  it('rejects a missing inviteContact', () => {
    const result = addStudentSchema.safeParse({ body: { grade: 3 } });

    expect(result.success).toBe(false);
  });

  it('accepts a valid grade + inviteContact', () => {
    const result = addStudentSchema.safeParse({ body: { grade: 3, inviteContact: 'a@b.com' } });

    expect(result.success).toBe(true);
  });
});

describe.skip('inviteGuardianSchema', () => {
  it('requires a non-empty contact', () => {
    const result = inviteGuardianSchema.safeParse({ body: { inviteContact: '' } });

    expect(result.success).toBe(false);
  });

  it('accepts a valid contact', () => {
    const result = inviteGuardianSchema.safeParse({
      body: { inviteContact: 'guardian@example.com' },
    });

    expect(result.success).toBe(true);
  });
});

describe.skip('revokeRelationshipSchema', () => {
  it('defaults revoke to false on an empty body', () => {
    const result = revokeRelationshipSchema.safeParse({ body: {} });

    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as any).body.revoke).toBe(false);
    }
  });
});
