/**
 * tests/utils/pagination.test.ts
 *
 * Journey step 1.8. Spec: `09-1-shared-config.md` §9.7.
 * Ties NFR-004/NFR-003 (unbounded-limit protection under load).
 *
 * Pure functions — nothing mocked.
 */

import { describe, expect, it } from 'vitest';

import { paginate, paginatedResponse } from '../../src/utils/pagination.js';

describe('paginate', () => {
  it('applies defaults when page/limit are omitted — page=1&limit=20', () => {
    expect(paginate(undefined, undefined)).toEqual({ skip: 0, take: 20, page: 1, limit: 20 });
  });

  it('computes a custom page/limit correctly', () => {
    expect(paginate(3, 10)).toEqual({ skip: 20, take: 10, page: 3, limit: 10 });
  });

  it('clamps limit at the documented max (100) rather than passing an unbounded value through', () => {
    const result = paginate(1, 500);

    expect(result.limit).toBe(100);
    expect(result.take).toBe(100);
  });

  it('normalizes a negative or zero page/limit to the minimum valid value', () => {
    const result = paginate(-1, 0);

    expect(result.page).toBe(1);
    expect(result.limit).toBeGreaterThanOrEqual(1);
    expect(result.skip).toBeGreaterThanOrEqual(0);
  });
});

describe('paginatedResponse', () => {
  it('wraps items/total/page/limit into the standard list-endpoint shape', () => {
    const items = [{ id: '1' }, { id: '2' }];

    const result = paginatedResponse(items, 47, 2, 20);

    expect(result).toEqual({ items, page: 2, limit: 20, total: 47 });
  });
});
