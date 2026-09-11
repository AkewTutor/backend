/**
 * tests/services/policy.service.test.ts
 *
 * Journey step 1.20. Spec: `09-1-shared-config.md` §9.16.
 * FRs: FR-SC-001, FR-AD-015.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    policyDocument: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import { getCurrentPolicy, publishNewVersion } from '../../src/services/policy.service.js';

describe.skip('getCurrentPolicy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the highest version for the type', async () => {
    (prisma.policyDocument.findFirst as any).mockResolvedValue({
      type: 'PRIVACY',
      version: 3,
      content: '# Privacy',
      publishedAt: new Date(),
    });

    const result = await getCurrentPolicy('PRIVACY' as any);

    expect(result.version).toBe(3);
    const arg = (prisma.policyDocument.findFirst as any).mock.calls[0][0];
    expect(JSON.stringify(arg)).toContain('desc');
  });

  it('no versions published yet throws ApiError(404, "Policy not yet published")', async () => {
    (prisma.policyDocument.findFirst as any).mockResolvedValue(null);

    await expect(getCurrentPolicy('REFUND' as any)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Policy not yet published',
    });
  });

  it('an invalid policy type is defensively rejected with ApiError(400, "Invalid policy type")', async () => {
    await expect(getCurrentPolicy('NOT_A_TYPE' as any)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Invalid policy type',
    });
  });
});

describe.skip('publishNewVersion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates version 1 as the first version for a type', async () => {
    (prisma.policyDocument.findFirst as any).mockResolvedValue(null);
    (prisma.policyDocument.create as any).mockResolvedValue({
      type: 'SAFETY',
      version: 1,
      publishedAt: new Date(),
    });

    const result = await publishNewVersion('SAFETY' as any, 'content', 'admin-1');

    expect(result.version).toBe(1);
  });

  it('increments correctly when a prior version (3) exists, producing version 4', async () => {
    (prisma.policyDocument.findFirst as any).mockResolvedValue({ type: 'SAFETY', version: 3 });
    (prisma.policyDocument.create as any).mockResolvedValue({
      type: 'SAFETY',
      version: 4,
      publishedAt: new Date(),
    });

    const result = await publishNewVersion('SAFETY' as any, 'content', 'admin-1');

    expect(result.version).toBe(4);
    const createArg = (prisma.policyDocument.create as any).mock.calls[0][0];
    expect(createArg.data.version).toBe(4);
  });

  it('never updates or deletes a prior version — only a create call is made', async () => {
    (prisma.policyDocument.findFirst as any).mockResolvedValue({ type: 'SAFETY', version: 3 });
    (prisma.policyDocument.create as any).mockResolvedValue({
      type: 'SAFETY',
      version: 4,
      publishedAt: new Date(),
    });

    await publishNewVersion('SAFETY' as any, 'content', 'admin-1');

    expect(prisma.policyDocument.create).toHaveBeenCalledTimes(1);
    expect((prisma.policyDocument as any).update).toBeUndefined();
  });

  it('versions independently per type across repeated publishes', async () => {
    (prisma.policyDocument.findFirst as any)
      .mockResolvedValueOnce(null) // PRIVACY v1
      .mockResolvedValueOnce(null) // TERMS v1
      .mockResolvedValueOnce({ type: 'PRIVACY', version: 1 }); // PRIVACY again -> v2
    (prisma.policyDocument.create as any)
      .mockResolvedValueOnce({ type: 'PRIVACY', version: 1, publishedAt: new Date() })
      .mockResolvedValueOnce({ type: 'TERMS', version: 1, publishedAt: new Date() })
      .mockResolvedValueOnce({ type: 'PRIVACY', version: 2, publishedAt: new Date() });

    const first = await publishNewVersion('PRIVACY' as any, 'c1', 'admin-1');
    const second = await publishNewVersion('TERMS' as any, 'c2', 'admin-1');
    const third = await publishNewVersion('PRIVACY' as any, 'c3', 'admin-1');

    expect(first.version).toBe(1);
    expect(second.version).toBe(1);
    expect(third.version).toBe(2);
  });
});
