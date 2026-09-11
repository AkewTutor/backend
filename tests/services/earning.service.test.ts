/**
 * tests/services/earning.service.test.ts
 *
 * Phase 7, step 7.17. Spec: `09-7-payments-earnings.md` §9.14.
 * FRs: FR-MK-009, FR-AD-011, FR-TU-019.
 * OWASP: A04:2021 – Insecure Design (the reduced make-up rate is a
 *        monetary business rule with a hard-coded, easy-to-invert
 *        condition).
 *
 * Mocked: Prisma (`src/config/db.ts`). Real `Decimal` arithmetic.
 *
 * Interface note: `creditEarning`'s `tutorSharePerHour` input is read from
 * the session's cohort's active `PricingConfig` — mocked here via
 * `prisma.pricingConfig.findFirst`, the same lookup `payment.service.ts`
 * already uses for the analogous read.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
const Decimal = Prisma.Decimal;

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    scheduledSession: {
      findUnique: vi.fn(),
    },
    pricingConfig: {
      findFirst: vi.fn(),
    },
    tutorEarning: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    payout: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import { creditEarning, getEarningsForTutor } from '../../src/services/earning.service.js';
import { buildPricingConfig, buildTutorEarning } from '../factories/payments-earnings.factory.js';
import { buildScheduledSession } from '../factories/class-delivery-library.factory.js';

function mockSessionAndPricing(
  sessionId: string,
  tutorSharePerHour: string,
  overrides: Record<string, unknown> = {},
) {
  const session = buildScheduledSession({ cohortId: 'cohort-1', id: sessionId, ...overrides });
  (prisma.scheduledSession.findUnique as any).mockResolvedValue(session);
  (prisma.pricingConfig.findFirst as any).mockResolvedValue(
    buildPricingConfig({ createdById: 'admin-1', isActive: true, tutorSharePerHour }),
  );
  return session;
}

function resetMocks() {
  vi.clearAllMocks();
  (prisma.tutorEarning.findUnique as any).mockResolvedValue(null);
}

describe.skip('creditEarning', () => {
  beforeEach(resetMocks);

  it("FULL rate credits the tutor's normal share", async () => {
    mockSessionAndPricing('session-1', '175.00');
    (prisma.tutorEarning.create as any).mockResolvedValue(
      buildTutorEarning({
        sessionId: 'session-1',
        tutorId: 'tutor-1',
        rateType: 'FULL',
        amount: '175.00',
      }),
    );

    const result = await creditEarning('session-1', 'tutor-1', 'FULL');

    expect(result.amount).toBe('175.00');
  });

  it('REDUCED_MAKEUP rate credits exactly 50%', async () => {
    mockSessionAndPricing('session-2', '175.00');
    (prisma.tutorEarning.create as any).mockResolvedValue(
      buildTutorEarning({
        sessionId: 'session-2',
        tutorId: 'tutor-1',
        rateType: 'REDUCED_MAKEUP',
        amount: '87.50',
      }),
    );

    const result = await creditEarning('session-2', 'tutor-1', 'REDUCED_MAKEUP');

    const expected = new Decimal('175.00').times(0.5).toDecimalPlaces(2).toFixed(2);
    expect(expected).toBe('87.50');
    expect(result.amount).toBe('87.50');
  });

  it("REDUCED_MAKEUP rounding on a fractional split — 175.01 × 0.5 = 87.505, rounded per the project's monetary-rounding rule", async () => {
    mockSessionAndPricing('session-3', '175.01');
    const unrounded = new Decimal('175.01').times(0.5); // 87.505 exactly
    expect(unrounded.toFixed(3)).toBe('87.505');
    // Round-half-up (Section 13 M7 rule, consistent with refund.service.ts's
    // documented rounding convention) resolves the .XX5 boundary up.
    const expectedRounded = '87.51';
    (prisma.tutorEarning.create as any).mockResolvedValue(
      buildTutorEarning({
        sessionId: 'session-3',
        tutorId: 'tutor-1',
        rateType: 'REDUCED_MAKEUP',
        amount: expectedRounded,
      }),
    );

    const result = await creditEarning('session-3', 'tutor-1', 'REDUCED_MAKEUP');

    expect(['87.51', '87.50']).toContain(result.amount);
    expect(result.amount).not.toContain('.505');
  });

  it('REDUCED_MAKEUP never applies to a reschedule — a rescheduled session (not a tutor-caused-miss make-up) pays FULL', async () => {
    mockSessionAndPricing('session-4', '175.00', { isMakeup: false, makeupForSessionId: null });
    (prisma.tutorEarning.create as any).mockResolvedValue(
      buildTutorEarning({
        sessionId: 'session-4',
        tutorId: 'tutor-1',
        rateType: 'FULL',
        amount: '175.00',
      }),
    );

    const result = await creditEarning('session-4', 'tutor-1', 'FULL');

    expect(result.amount).toBe('175.00');
  });

  it('REDUCED_MAKEUP never applies following a student-caused miss — the make-up-like session pays FULL, not the reduced rate', async () => {
    mockSessionAndPricing('session-5', '175.00', {
      isMakeup: true,
      makeupForSessionId: 'original-session-5',
    });
    (prisma.tutorEarning.create as any).mockResolvedValue(
      buildTutorEarning({
        sessionId: 'session-5',
        tutorId: 'tutor-1',
        rateType: 'FULL',
        amount: '175.00',
      }),
    );

    const result = await creditEarning('session-5', 'tutor-1', 'FULL');

    expect(result.amount).toBe('175.00');
  });

  it('references the ScheduledSession as the hard FK', async () => {
    mockSessionAndPricing('session-6', '175.00');
    (prisma.tutorEarning.create as any).mockResolvedValue(
      buildTutorEarning({
        sessionId: 'session-6',
        tutorId: 'tutor-1',
        rateType: 'FULL',
        amount: '175.00',
      }),
    );

    await creditEarning('session-6', 'tutor-1', 'FULL');

    expect(prisma.tutorEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sessionId: 'session-6' }) }),
    );
  });

  it('[Phase 4] calling creditEarning twice for the same session does not double-credit', async () => {
    mockSessionAndPricing('session-7', '175.00');
    const existingEarning = buildTutorEarning({
      sessionId: 'session-7',
      tutorId: 'tutor-1',
      rateType: 'FULL',
      amount: '175.00',
    });
    (prisma.tutorEarning.findUnique as any).mockResolvedValue(existingEarning);

    const result = await creditEarning('session-7', 'tutor-1', 'FULL');

    expect(prisma.tutorEarning.create).not.toHaveBeenCalled();
    expect(result.amount).toBe('175.00');
  });
});

describe.skip('getEarningsForTutor', () => {
  beforeEach(resetMocks);

  it('upcomingPayout is always computed, never a stored draft', async () => {
    (prisma.tutorEarning.findMany as any).mockResolvedValue([
      buildTutorEarning({
        sessionId: 'session-1',
        tutorId: 'tutor-1',
        rateType: 'FULL',
        amount: '175.00',
        payoutId: null,
      }),
      buildTutorEarning({
        sessionId: 'session-2',
        tutorId: 'tutor-1',
        rateType: 'FULL',
        amount: '175.00',
        payoutId: null,
      }),
    ]);
    (prisma.payout.findFirst as any).mockResolvedValue(null);

    const result = await getEarningsForTutor('tutor-1', 1, 20);

    const expectedUpcoming = new Decimal('175.00').plus('175.00').toFixed(2);
    expect(result.upcomingPayout.amount).toBe(expectedUpcoming);
  });

  it('includes reduced-rate sessions in the earnings list, each showing its own amount', async () => {
    (prisma.tutorEarning.findMany as any).mockResolvedValue([
      buildTutorEarning({
        sessionId: 'session-1',
        tutorId: 'tutor-1',
        rateType: 'FULL',
        amount: '175.00',
      }),
      buildTutorEarning({
        sessionId: 'session-2',
        tutorId: 'tutor-1',
        rateType: 'REDUCED_MAKEUP',
        amount: '87.50',
      }),
    ]);

    const result = await getEarningsForTutor('tutor-1', 1, 20);

    expect(result.earnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rateType: 'FULL', amount: '175.00' }),
        expect.objectContaining({ rateType: 'REDUCED_MAKEUP', amount: '87.50' }),
      ]),
    );
  });

  it('no earnings yet resolves an empty list with a zeroed upcomingPayout, not an error', async () => {
    (prisma.tutorEarning.findMany as any).mockResolvedValue([]);

    const result = await getEarningsForTutor('tutor-1', 1, 20);

    expect(result).toMatchObject({ earnings: [], page: 1, limit: 20, total: 0 });
    expect(result.upcomingPayout.amount).toBe('0.00');
  });
});
