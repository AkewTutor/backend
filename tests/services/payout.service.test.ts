/**
 * tests/services/payout.service.test.ts
 *
 * Phase 7, step 7.20. Spec: `09-7-payments-earnings.md` §9.16.
 * FRs: FR-TU-019, FR-AD-011.
 * OWASP: A01:2021 – Broken Access Control (Admin-only), A04:2021 –
 *        Insecure Design (no client-facing creation path is itself a
 *        deliberate control against a client forging a payout).
 *
 * Mocked: Prisma (`src/config/db.ts`).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    tutorEarning: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
    payout: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  adminAdjust,
  generateMonthlyPayouts,
  markPaid,
} from '../../src/services/payout.service.js';
import { buildPayout, buildTutorEarning } from '../factories/payments-earnings.factory.js';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('generateMonthlyPayouts', () => {
  beforeEach(resetMocks);

  it('batches unpaid earnings per tutor for the period — creates exactly one Payout per tutor with unpaid earnings', async () => {
    const periodStart = '2026-08-01';
    const periodEnd = '2026-08-28';
    (prisma.tutorEarning.findMany as any).mockResolvedValue([
      buildTutorEarning({
        tutorId: 'tutor-1',
        sessionId: 'session-1',
        amount: '175.00',
        payoutId: null,
      }),
      buildTutorEarning({
        tutorId: 'tutor-1',
        sessionId: 'session-2',
        amount: '175.00',
        payoutId: null,
      }),
      buildTutorEarning({
        tutorId: 'tutor-2',
        sessionId: 'session-3',
        amount: '245.00',
        payoutId: null,
      }),
      // tutor-3 has no unpaid earnings in this window — deliberately absent.
    ]);
    (prisma.payout.create as any)
      .mockResolvedValueOnce(buildPayout({ tutorId: 'tutor-1', totalAmount: '350.00' }))
      .mockResolvedValueOnce(buildPayout({ tutorId: 'tutor-2', totalAmount: '245.00' }));

    const result = await generateMonthlyPayouts(periodStart, periodEnd);

    expect(result.created).toBe(2);
    expect(prisma.payout.create).toHaveBeenCalledTimes(2);
    expect(prisma.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tutorId: 'tutor-1', status: 'PENDING' }),
      }),
    );
    expect(prisma.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tutorId: 'tutor-2', status: 'PENDING' }),
      }),
    );
  });

  it('marks batched earnings to prevent double-counting — a second run for the same period creates no additional payouts', async () => {
    const periodStart = '2026-08-01';
    const periodEnd = '2026-08-28';
    (prisma.tutorEarning.findMany as any).mockResolvedValueOnce([
      buildTutorEarning({
        tutorId: 'tutor-1',
        sessionId: 'session-1',
        amount: '175.00',
        payoutId: null,
      }),
    ]);
    (prisma.payout.create as any).mockResolvedValueOnce(
      buildPayout({ tutorId: 'tutor-1', totalAmount: '175.00' }),
    );

    await generateMonthlyPayouts(periodStart, periodEnd);

    // Second run: the earning is now batched (payoutId set), so the query
    // for unpaid earnings in this window resolves empty.
    (prisma.tutorEarning.findMany as any).mockResolvedValueOnce([]);

    const secondRun = await generateMonthlyPayouts(periodStart, periodEnd);

    expect(secondRun.created).toBe(0);
    expect(prisma.payout.create).toHaveBeenCalledTimes(1);
  });

  it('no manual client-facing creation path exists — confirmed at the routes level in payout.routes.test.ts (§0.4)', () => {
    // Documentation-level check: this file exercises generateMonthlyPayouts
    // directly as an internal function; payout.routes.test.ts (7.22)
    // confirms no POST /admin/payouts route maps to it.
    expect(typeof generateMonthlyPayouts).toBe('function');
  });
});

describe.skip('markPaid', () => {
  beforeEach(resetMocks);

  it('marks a pending payout paid', async () => {
    const pendingPayout = buildPayout({
      tutorId: 'tutor-1',
      totalAmount: '350.00',
      status: 'PENDING',
    });
    (prisma.payout.findUnique as any).mockResolvedValue(pendingPayout);
    (prisma.payout.update as any).mockResolvedValue({
      ...pendingPayout,
      status: 'PAID',
      paidAt: new Date(),
    });

    const result = await markPaid(pendingPayout.id, 'admin-1');

    expect(result).toMatchObject({ status: 'PAID' });
    expect(result.paidAt).toBeTruthy();
  });

  it('rejects marking an already-paid payout', async () => {
    const paidPayout = buildPayout({
      tutorId: 'tutor-1',
      totalAmount: '350.00',
      status: 'PAID',
      paidAt: new Date(),
    });
    (prisma.payout.findUnique as any).mockResolvedValue(paidPayout);

    await expect(markPaid(paidPayout.id, 'admin-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'This payout has already been marked as paid',
    });
  });
});

describe.skip('adminAdjust', () => {
  beforeEach(resetMocks);

  it('corrects a pending payout batch before it is paid (UC-82)', async () => {
    const pendingPayout = buildPayout({
      tutorId: 'tutor-1',
      totalAmount: '350.00',
      status: 'PENDING',
    });
    (prisma.payout.findUnique as any).mockResolvedValue(pendingPayout);
    (prisma.payout.update as any).mockResolvedValue({ ...pendingPayout, totalAmount: '300.00' });

    const result = await adminAdjust(pendingPayout.id, 'admin-1', { totalAmount: '300.00' } as any);

    expect(result.totalAmount).toBe('300.00');
  });
});
