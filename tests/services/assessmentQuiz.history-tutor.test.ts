import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: { assessmentAttempt: { findMany: vi.fn() } },
}));

import { prisma } from '../../src/config/db.js';
import { getAssessmentHistory } from '../../src/services/assessmentQuiz.service.js';

const db = prisma as any;

function row(tutor: any) {
  return {
    id: 'a1',
    quizId: 'q1',
    score: 1,
    total: 2,
    submittedAt: new Date(),
    supersededAt: null,
    quiz: {
      cohortId: 'c1',
      title: null,
      weekStartDate: new Date(),
      deletedAt: null,
      cohort: { tutor },
    },
    cohortMembership: {
      studentId: 'stu-1',
      student: { user: { name: null, email: 's6@test.local' } },
    },
  };
}

describe('getAssessmentHistory tutor info', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the cohort tutor user with each attempt', async () => {
    db.assessmentAttempt.findMany.mockResolvedValue([]);
    await getAssessmentHistory('admin-1', 'ADMIN', {});
    const include = db.assessmentAttempt.findMany.mock.calls[0][0].include;
    expect(include.quiz.include.cohort.include.tutor.include.user).toBe(true);
  });

  it('uses the tutor user name when set', async () => {
    db.assessmentAttempt.findMany.mockResolvedValue([
      row({ user: { name: 'Abel Tesfaye', email: 't3@test.local' } }),
    ]);
    const rows = await getAssessmentHistory('admin-1', 'ADMIN', {});
    expect(rows[0]).toMatchObject({ tutorName: 'Abel Tesfaye', tutorEmail: 't3@test.local' });
  });

  it('falls back to the tutor email when no name is set', async () => {
    db.assessmentAttempt.findMany.mockResolvedValue([
      row({ user: { name: null, email: 't3@test.local' } }),
    ]);
    const rows = await getAssessmentHistory('admin-1', 'ADMIN', {});
    expect(rows[0].tutorName).toBe('t3@test.local');
  });
});
