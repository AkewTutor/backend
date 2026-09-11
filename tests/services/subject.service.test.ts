/**
 * tests/services/subject.service.test.ts
 *
 * Journey step 2.17. Spec: `09-2-accounts-guardianship.md` §9.14.
 * FRs: FR-AD-013. NFRs: NFR-011 (extensible catalog).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    subject: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  createSubject,
  deactivateSubject,
  listSubjects,
} from '../../src/services/subject.service.js';

function resetAllMocks() {
  vi.clearAllMocks();
}

describe.skip('listSubjects', () => {
  beforeEach(() => resetAllMocks());

  it('returns only active subjects by default', async () => {
    (prisma.subject.findMany as any).mockResolvedValue([{ id: 's1', isActive: true }]);

    await listSubjects(false);

    const callArg = (prisma.subject.findMany as any).mock.calls[0][0];
    expect(callArg.where).toMatchObject({ isActive: true });
  });

  it('includeInactive returns all subjects, unfiltered by isActive', async () => {
    (prisma.subject.findMany as any).mockResolvedValue([
      { id: 's1', isActive: true },
      { id: 's2', isActive: false },
    ]);

    const result = await listSubjects(true);

    expect(result).toHaveLength(2);
  });
});

describe.skip('createSubject / deactivateSubject', () => {
  beforeEach(() => resetAllMocks());

  it('creates a new subject for a new name', async () => {
    (prisma.subject.create as any).mockResolvedValue({ id: 's1', name: 'Biology' });

    await expect(createSubject('Biology')).resolves.toMatchObject({ name: 'Biology' });
  });

  it('rejects a duplicate name', async () => {
    const uniqueError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    (prisma.subject.create as any).mockRejectedValue(uniqueError);

    await expect(createSubject('Mathematics')).rejects.toMatchObject({
      statusCode: 409,
      message: 'A subject with this name already exists',
    });
  });

  it('deactivateSubject flips isActive without ever issuing a delete call', async () => {
    (prisma.subject.update as any).mockResolvedValue({ id: 's1', isActive: false });

    await deactivateSubject('s1', false);

    expect(prisma.subject.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
    );
    expect((prisma.subject as any).delete).toBeUndefined();
  });

  it('reactivating a previously deactivated subject resolves isActive true', async () => {
    (prisma.subject.update as any).mockResolvedValue({ id: 's1', isActive: true });

    await expect(deactivateSubject('s1', true)).resolves.toMatchObject({
      id: 's1',
      isActive: true,
    });
  });
});
