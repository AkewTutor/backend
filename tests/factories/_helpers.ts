/**
 * tests/factories/_helpers.ts
 *
 * Internal helpers shared by every factory file. Not itself a factory —
 * not listed in `00-test-fixtures.md §0`'s factory table, so it's exported
 * separately rather than re-exported from `tests/factories/index.ts`.
 */

/** Fresh, syntactically-valid UUID per `00-test-fixtures.md §1.1`. No guarantee a backing row exists. */
export function freshId(): string {
  return crypto.randomUUID();
}

/** `createdAt`/`updatedAt`-style default per `00-test-fixtures.md §1.3` — "now" at call time. */
export function now(): Date {
  return new Date();
}

/** Adds `days` days to `date`, per the offset convention in `00-test-fixtures.md §1.3`. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Adds `hours` hours to `date`. */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Decimal-safe money string per `00-test-fixtures.md §1.2` — factories never
 * return a raw JS `number` for a `Decimal` column.
 */
export function money(amount: number): string {
  return amount.toFixed(2);
}

/** Shallow-merges sparse `overrides` over a fully-populated base, per `00-test-fixtures.md §0`. */
export function withOverrides<T>(base: T, overrides?: Partial<T>): T {
  return { ...base, ...(overrides ?? {}) };
}
