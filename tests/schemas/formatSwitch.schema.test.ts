/**
 * tests/schemas/formatSwitch.schema.test.ts
 *
 * Journey step 3.11. Spec: `09-3-matching-cohorts.md` §9.9.
 * Function-level ref: `8-3-matching-cohorts.md` — src/schemas/formatSwitch.schema.ts.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { requestFormatSwitchSchema } from '../../src/schemas/formatSwitch.schema.js';

describe('requestFormatSwitchSchema', () => {
  it('requires a valid toFormat enum value', () => {
    const result = requestFormatSwitchSchema.safeParse({ body: { toFormat: 'ONE_TO_TWO' } });

    expect(result.success).toBe(false);
  });

  it('rejects a missing toFormat', () => {
    const result = requestFormatSwitchSchema.safeParse({ body: {} });

    expect(result.success).toBe(false);
  });

  it('accepts each documented enum value', () => {
    for (const toFormat of ['ONE_TO_ONE', 'ONE_TO_THREE', 'ONE_TO_FIVE']) {
      const result = requestFormatSwitchSchema.safeParse({ body: { toFormat } });
      expect(result.success).toBe(true);
    }
  });

  it('accepts an optional studentId', () => {
    const result = requestFormatSwitchSchema.safeParse({
      body: { toFormat: 'ONE_TO_ONE', studentId: randomUUID() },
    });

    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID studentId when provided', () => {
    const result = requestFormatSwitchSchema.safeParse({
      body: { toFormat: 'ONE_TO_ONE', studentId: 'nope' },
    });

    expect(result.success).toBe(false);
  });
});
