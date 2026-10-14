import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    tutorProfile: { findUnique: vi.fn() },
    tutorSubjectRanking: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../src/config/db.js';
import { getRankedSubjects } from '../../src/services/tutorProfile.service.js';

const p = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
  // getProfile: lookup by profile id misses, lookup by userId hits.
  p.tutorProfile.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'tp-1' });
});

describe('getRankedSubjects', () => {
  it('returns the ranked subjects ordered by rank with their names', async () => {
    p.tutorSubjectRanking.findMany.mockResolvedValue([
      { subjectId: 's-math', rank: 1, subject: { name: 'Mathematics' } },
      { subjectId: 's-phys', rank: 2, subject: { name: 'Physics' } },
    ]);

    const out = await getRankedSubjects('user-1');

    expect(p.tutorSubjectRanking.findMany).toHaveBeenCalledWith({
      where: { tutorId: 'tp-1' },
      include: { subject: true },
      orderBy: { rank: 'asc' },
    });
    expect(out).toEqual({
      subjects: [
        { subjectId: 's-math', subjectName: 'Mathematics', rank: 1 },
        { subjectId: 's-phys', subjectName: 'Physics', rank: 2 },
      ],
    });
  });

  it('returns an empty list when the tutor has not ranked anything', async () => {
    p.tutorSubjectRanking.findMany.mockResolvedValue([]);
    expect(await getRankedSubjects('user-1')).toEqual({ subjects: [] });
  });

  it('404s when the tutor profile does not exist', async () => {
    p.tutorProfile.findUnique.mockReset();
    p.tutorProfile.findUnique.mockResolvedValue(null);

    await expect(getRankedSubjects('user-1')).rejects.toThrow('Tutor profile not found');
    expect(p.tutorSubjectRanking.findMany).not.toHaveBeenCalled();
  });
});
