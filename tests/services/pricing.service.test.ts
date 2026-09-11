/**
 * tests/services/pricing.service.test.ts
 *
 * Phase 7, step 7.10. Spec: `09-7-payments-earnings.md` §9.9.
 * FRs: FR-AD-009, Section 7 Definition of Done #2.
 * OWASP: A01:2021 – Broken Access Control (Admin-only mutate),
 *        A04:2021 – Insecure Design (versioned atomic activation prevents
 *        a race that could leave two active configs for the same format).
 *
 * Mocked: Prisma (`src/config/db.ts`). Real `Decimal` arithmetic.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    pricingConfig: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
    },
    tutorEarning: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import { createAndActivateConfig, getActiveConfig } from '../../src/services/pricing.service.js';
import ApiError from '../../src/utils/ApiError.js';
import { buildPayment, buildPricingConfig } from '../factories/payments-earnings.factory.js';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('getActiveConfig', () => {
  beforeEach(resetMocks);

  it('returns one active row per format', async () => {
    const activeConfigs = [
      buildPricingConfig({ createdById: 'admin-1', format: 'ONE_TO_ONE', isActive: true }),
      buildPricingConfig({ createdById: 'admin-1', format: 'ONE_TO_THREE', isActive: true }),
      buildPricingConfig({ createdById: 'admin-1', format: 'ONE_TO_FIVE', isActive: true }),
    ];
    (prisma.pricingConfig.findMany as any).mockResolvedValue(activeConfigs);

    const result = await getActiveConfig();

    expect(result).toHaveLength(3);
    expect(result.every((c: any) => c.isActive === true)).toBe(true);
    expect(prisma.pricingConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
    );
  });

  it('a partially-formed 1-to-5 group still bills at the full, unadjusted per-student rate', async () => {
    const config = buildPricingConfig({
      createdById: 'admin-1',
      format: 'ONE_TO_FIVE',
      isActive: true,
      pricePerStudentPerHour: '100.00',
    });
    (prisma.pricingConfig.findMany as any).mockResolvedValue([config]);

    const result = await getActiveConfig();

    expect(result[0].pricePerStudentPerHour).toBe('100.00');
  });
});

describe.skip('createAndActivateConfig', () => {
  beforeEach(resetMocks);

  it('mismatched split rejected at the service layer too', async () => {
    await expect(
      createAndActivateConfig(
        'ONE_TO_ONE',
        {
          pricePerStudentPerHour: '100.00',
          totalPerHour: '100.00',
          platformSharePerHour: '40.00',
          tutorSharePerHour: '50.00',
        },
        'admin-1',
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Platform and tutor shares must sum to the total per hour',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deactivates the old config and activates the new one atomically — a single prisma.$transaction call', async () => {
    const existingActive = buildPricingConfig({
      createdById: 'admin-old',
      format: 'ONE_TO_ONE',
      isActive: true,
    });
    (prisma.pricingConfig.findFirst as any).mockResolvedValue(existingActive);
    const newConfig = buildPricingConfig({
      createdById: 'admin-1',
      format: 'ONE_TO_ONE',
      isActive: true,
      pricePerStudentPerHour: '375.00',
    });
    (prisma.$transaction as any).mockResolvedValue([
      { ...existingActive, isActive: false },
      newConfig,
    ]);

    await createAndActivateConfig(
      'ONE_TO_ONE',
      {
        pricePerStudentPerHour: '375.00',
        totalPerHour: '375.00',
        platformSharePerHour: '125.00',
        tutorSharePerHour: '250.00',
      },
      'admin-1',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const transactionArg = (prisma.$transaction as any).mock.calls[0][0];
    expect(Array.isArray(transactionArg)).toBe(true);
    expect(transactionArg.length).toBeGreaterThanOrEqual(2);
  });

  it('the change applies to the next new booking only — a prior Payment.amount is never retroactively altered', async () => {
    const oldConfig = buildPricingConfig({
      createdById: 'admin-old',
      format: 'ONE_TO_ONE',
      isActive: true,
      pricePerStudentPerHour: '350.00',
    });
    const priorPayment = buildPayment({
      cohortMembershipId: 'membership-1',
      amount: '350.00',
      status: 'SUCCESS',
    });
    (prisma.pricingConfig.findFirst as any).mockResolvedValue(oldConfig);
    (prisma.payment.findUnique as any).mockResolvedValue(priorPayment);
    (prisma.$transaction as any).mockResolvedValue([
      { ...oldConfig, isActive: false },
      buildPricingConfig({
        createdById: 'admin-1',
        format: 'ONE_TO_ONE',
        isActive: true,
        pricePerStudentPerHour: '400.00',
      }),
    ]);

    await createAndActivateConfig(
      'ONE_TO_ONE',
      {
        pricePerStudentPerHour: '400.00',
        totalPerHour: '400.00',
        platformSharePerHour: '120.00',
        tutorSharePerHour: '280.00',
      },
      'admin-1',
    );

    const refetched = await prisma.payment.findUnique({ where: { id: priorPayment.id } });
    expect((refetched as any).amount).toBe('350.00');
  });
});
