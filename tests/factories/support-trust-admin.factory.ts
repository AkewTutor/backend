/**
 * tests/factories/support-trust-admin.factory.ts
 *
 * Owns: ComplaintReport
 * Ref: 00-test-fixtures.md §2 "support-trust-admin"
 *
 * Phase 0, step 0.10 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { freshId, now, withOverrides } from './_helpers.js';
import type { ComplaintReport } from './types.js';

/**
 * Required overrides: `reporterId`, `category`, `description`. `status`
 * defaults `OPEN`; for `category: 'TUTOR_CONDUCT'`, the caller must also
 * pass `relatedCohortId` and/or `relatedSessionId` per the tutor-resolution
 * rule in `04-database-and-data-model.md §4.2.9` — this factory does not
 * silently populate one to paper over an omitted override.
 */
export function buildComplaintReport(
  overrides: Partial<ComplaintReport> & {
    reporterId: string;
    category: ComplaintReport['category'];
    description: string;
  },
): ComplaintReport {
  const base: ComplaintReport = {
    id: freshId(),
    reporterId: overrides.reporterId,
    relatedCohortId: null,
    relatedSessionId: null,
    relatedPaymentId: null,
    relatedThreadId: null,
    category: overrides.category,
    description: overrides.description,
    status: 'OPEN',
    resolutionAction: null,
    resolutionNotes: null,
    resolvedById: null,
    resolvedAt: null,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}
