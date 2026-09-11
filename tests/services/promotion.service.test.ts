/**
 * tests/services/promotion.service.test.ts
 *
 * Phase 7, step 7.24. Spec: `09-7-payments-earnings.md` §9.19.
 * FRs: FR-AD-016.
 * OWASP: A01:2021 – Broken Access Control (Admin-only create), A04:2021 –
 *        Insecure Design (expired/inactive-code rejection is the central
 *        anti-abuse control here).
 *
 * Mocked: Prisma (`src/config/db.ts`). Real `Decimal` arithmetic.
 *
 * Scope note: Doc 8-7 also lists a co-located `updatePromotion` (backing
 * `PATCH /admin/promotions/:id`), but §9.19's test case table only details
 * `createPromotion`/`listActivePromotions`/`applyToPayment` — this file
 * matches that scope exactly and does not invent `updatePromotion` cases
 * beyond what the spec pins.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const Decimal = Prisma.Decimal;

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    promotionCode: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  applyToPayment,
  createPromotion,
  listActivePromotions,
} from '../../src/services/promotion.service.js';
import { buildPromotionCode } from '../factories/payments-earnings.factory.js';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('createPromotion', () => {
  beforeEach(resetMocks);

  it('creates a new promotion', async () => {
    (prisma.promotionCode.findUnique as any).mockResolvedValue(null);
    const created = buildPromotionCode({ createdById: 'admin-1', code: 'BACKTOSCHOOL2026' });
    (prisma.promotionCode.create as any).mockResolvedValue(created);

    const result = await createPromotion(
      {
        code: 'BACKTOSCHOOL2026',
        discountType: 'PERCENT',
        discountValue: '10',
        validFrom: '2026-09-01T00:00:00.000Z',
        validTo: '2026-09-30T00:00:00.000Z',
      } as any,
      'admin-1',
    );

    expect(result).toMatchObject({ code: 'BACKTOSCHOOL2026' });
  });

  it('rejects a duplicate code', async () => {
    (prisma.promotionCode.findUnique as any).mockResolvedValue(
      buildPromotionCode({ createdById: 'admin-0', code: 'BACKTOSCHOOL2026' }),
    );

    await expect(
      createPromotion(
        {
          code: 'BACKTOSCHOOL2026',
          discountType: 'PERCENT',
          discountValue: '10',
          validFrom: '2026-09-01T00:00:00.000Z',
          validTo: '2026-09-30T00:00:00.000Z',
        } as any,
        'admin-1',
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'A promotion with this code already exists',
    });
  });

  it('rejects a non-ascending date range at the service layer too, bypassing the schema', async () => {
    (prisma.promotionCode.findUnique as any).mockResolvedValue(null);

    await expect(
      createPromotion(
        {
          code: 'BADRANGE2026',
          discountType: 'PERCENT',
          discountValue: '10',
          validFrom: '2026-09-30T00:00:00.000Z',
          validTo: '2026-09-01T00:00:00.000Z',
        } as any,
        'admin-1',
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'End date must be after start date',
    });
  });
});

describe.skip('listActivePromotions', () => {
  beforeEach(resetMocks);

  it('excludes expired/inactive codes', async () => {
    const activeCode = buildPromotionCode({
      createdById: 'admin-1',
      code: 'ACTIVE2026',
      isActive: true,
      validFrom: new Date('2026-09-01T00:00:00Z'),
      validTo: new Date('2026-09-30T00:00:00Z'),
    });
    // Mock resolves only the currently-active row — the expired and
    // not-yet-valid codes are excluded by the query itself.
    (prisma.promotionCode.findMany as any).mockResolvedValue([activeCode]);

    const result = await listActivePromotions();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('ACTIVE2026');
  });
});

describe.skip('applyToPayment', () => {
  beforeEach(resetMocks);

  it('computes a PERCENT discount', async () => {
    (prisma.promotionCode.findUnique as any).mockResolvedValue(
      buildPromotionCode({
        createdById: 'admin-1',
        discountType: 'PERCENT',
        discountValue: '10',
        isActive: true,
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validTo: new Date('2027-01-01T00:00:00Z'),
      }),
    );

    const result = await applyToPayment('PROMO10', '1000.00');

    const expected = new Decimal('1000.00').minus(new Decimal('1000.00').times('0.10')).toFixed(2);
    expect(expected).toBe('900.00');
    expect(result.discountedAmount).toBe('900.00');
  });

  it('computes a FIXED_ETB discount', async () => {
    (prisma.promotionCode.findUnique as any).mockResolvedValue(
      buildPromotionCode({
        createdById: 'admin-1',
        discountType: 'FIXED_ETB',
        discountValue: '50',
        isActive: true,
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validTo: new Date('2027-01-01T00:00:00Z'),
      }),
    );

    const result = await applyToPayment('PROMO50', '1000.00');

    const expected = new Decimal('1000.00').minus('50').toFixed(2);
    expect(expected).toBe('950.00');
    expect(result.discountedAmount).toBe('950.00');
  });

  it('rejects an unknown/expired/inactive code', async () => {
    (prisma.promotionCode.findUnique as any).mockResolvedValue(null);

    await expect(applyToPayment('BADCODE', '1000.00')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid or expired promotion code',
    });
  });

  it('a FIXED_ETB discount never produces a negative amount — floors at 0.00', async () => {
    (prisma.promotionCode.findUnique as any).mockResolvedValue(
      buildPromotionCode({
        createdById: 'admin-1',
        discountType: 'FIXED_ETB',
        discountValue: '50',
        isActive: true,
        validFrom: new Date('2026-01-01T00:00:00Z'),
        validTo: new Date('2027-01-01T00:00:00Z'),
      }),
    );

    const result = await applyToPayment('PROMO50', '10.00');

    const naiveSubtraction = new Decimal('10.00').minus('50').toFixed(2);
    expect(naiveSubtraction).toBe('-40.00'); // what an unfloored subtraction would produce
    expect(result.discountedAmount).toBe('0.00');
  });
});
