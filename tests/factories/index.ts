/**
 * tests/factories/index.ts
 *
 * Barrel re-export of all 8 factory modules (`00-test-fixtures.md §0`),
 * so a test — backend or frontend, via the shared package/path alias
 * (`00-test-fixtures.md §0`, `AKEWTutor-Backend-Test-Implementation-Journey.md §6`) —
 * can do `import { buildUser, buildCohort } from 'tests/factories'` instead
 * of reaching into each module file individually.
 *
 * Individual factory files remain independently importable too; this file
 * only aggregates.
 */

export * from './shared-config.factory.js';
export * from './accounts-guardianship.factory.js';
export * from './matching-cohorts.factory.js';
export * from './class-delivery-library.factory.js';
export * from './messaging.factory.js';
export * from './payments-earnings.factory.js';
export * from './gamification-engagement.factory.js';
export * from './support-trust-admin.factory.js';
export type * from './types.js';
