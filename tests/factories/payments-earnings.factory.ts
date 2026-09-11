/**
 * tests/factories/payments-earnings.factory.ts
 *
 * Owns: PricingConfig, Payment, PaymentPause, Refund, TutorEarning, Payout,
 * PromotionCode
 * Ref: 00-test-fixtures.md §2 "payments-earnings"
 *
 * Phase 0, step 0.9 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 *
 * Money fields are decimal-safe strings, never raw numbers — §1.2.
 */

import { addDays, freshId, money, now, withOverrides } from './_helpers.js';
import type {
  Payment,
  PaymentPause,
  Payout,
  PricingConfig,
  PromotionCode,
  Refund,
  TutorEarning,
} from './types.js';

/**
 * Required override: `createdById`. `format` defaults `ONE_TO_ONE`;
 * `isActive` defaults `false` (pass `true` explicitly — mirrors the "only
 * one active per format" invariant being a deliberate act, not a default).
 */
export function buildPricingConfig(
  overrides: Partial<PricingConfig> & { createdById: string },
): PricingConfig {
  const base: PricingConfig = {
    id: freshId(),
    format: 'ONE_TO_ONE',
    pricePerStudentPerHour: money(350),
    totalPerHour: money(350),
    platformSharePerHour: money(105),
    tutorSharePerHour: money(245),
    isActive: false,
    createdById: overrides.createdById,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/**
 * Required override: `cohortMembershipId`. `provider` defaults `CHAPA`;
 * `status` defaults `PENDING`; `billingPeriodStart`/`End` default a 30-day
 * window starting now.
 */
export function buildPayment(
  overrides: Partial<Payment> & { cohortMembershipId: string },
): Payment {
  const billingPeriodStart = overrides.billingPeriodStart ?? now();
  const base: Payment = {
    id: freshId(),
    cohortMembershipId: overrides.cohortMembershipId,
    amount: money(1400),
    provider: 'CHAPA',
    providerTransactionId: null,
    status: 'PENDING',
    billingPeriodStart,
    billingPeriodEnd: addDays(billingPeriodStart, 30),
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/** Required override: `cohortMembershipId`. `reason` defaults `NONPAYMENT`; `endedAt` defaults `null` (open pause). */
export function buildPaymentPause(
  overrides: Partial<PaymentPause> & { cohortMembershipId: string },
): PaymentPause {
  const base: PaymentPause = {
    id: freshId(),
    cohortMembershipId: overrides.cohortMembershipId,
    startedAt: now(),
    endedAt: null,
    reason: 'NONPAYMENT',
  };
  return withOverrides(base, overrides);
}

/**
 * Required overrides: `paymentId`, `reason`, `sessionsRemaining`,
 * `totalSessionsBilled`. `status` defaults `PENDING` per the I1 fix;
 * `amount` is **not** auto-derived by the factory (the proration formula is
 * production logic under test, not fixture logic) — callers pass the
 * expected `amount` explicitly.
 */
export function buildRefund(
  overrides: Partial<Refund> & {
    paymentId: string;
    reason: Refund['reason'];
    sessionsRemaining: number;
    totalSessionsBilled: number;
    amount: string;
  },
): Refund {
  const base: Refund = {
    id: freshId(),
    paymentId: overrides.paymentId,
    reason: overrides.reason,
    status: 'PENDING',
    sessionsRemaining: overrides.sessionsRemaining,
    totalSessionsBilled: overrides.totalSessionsBilled,
    amount: overrides.amount,
    approvedById: null,
    approvedAt: null,
    rejectedById: null,
    rejectedAt: null,
    rejectionReason: null,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/** Required overrides: `tutorId`, `sessionId`. `rateType` defaults `FULL`. */
export function buildTutorEarning(
  overrides: Partial<TutorEarning> & { tutorId: string; sessionId: string },
): TutorEarning {
  const base: TutorEarning = {
    id: freshId(),
    tutorId: overrides.tutorId,
    sessionId: overrides.sessionId,
    amount: money(245),
    rateType: 'FULL',
    payoutId: null,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/** Required override: `tutorId`. `status` defaults `PENDING`; `totalAmount` defaults `"0.00"`. */
export function buildPayout(overrides: Partial<Payout> & { tutorId: string }): Payout {
  const periodStart = overrides.periodStart ?? now();
  const base: Payout = {
    id: freshId(),
    tutorId: overrides.tutorId,
    periodStart,
    periodEnd: addDays(periodStart, 30),
    totalAmount: money(0),
    status: 'PENDING',
    paidAt: null,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/**
 * Required override: `createdById`. `code` defaults a unique placeholder;
 * `discountType` defaults `PERCENT`; `isActive` defaults `true`.
 */
export function buildPromotionCode(
  overrides: Partial<PromotionCode> & { createdById: string },
): PromotionCode {
  const validFrom = overrides.validFrom ?? now();
  const base: PromotionCode = {
    id: freshId(),
    code: `PROMO-${freshId().slice(0, 8).toUpperCase()}`,
    discountType: 'PERCENT',
    discountValue: money(10),
    validFrom,
    validTo: addDays(validFrom, 30),
    isActive: true,
    createdById: overrides.createdById,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}
