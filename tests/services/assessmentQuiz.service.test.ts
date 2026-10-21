import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    cohort: { findUnique: vi.fn() },
    cohortMembership: { findFirst: vi.fn() },
    assessmentQuiz: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    assessmentAttempt: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  getAssessmentHistory,
  resetAttempt,
  submitAttempt,
  updateQuiz,
} from '../../src/services/assessmentQuiz.service.js';

const db = prisma as any;

const QUIZ = {
  id: 'quiz-1',
  cohortId: 'cohort-1',
  deletedAt: null,
  questions: [
    {
      text: 'Q1',
      options: [
        { text: 'a', isCorrect: false },
        { text: 'b', isCorrect: true },
      ],
    },
    {
      text: 'Q2',
      options: [
        { text: 'a', isCorrect: true },
        { text: 'b', isCorrect: false },
        { text: 'c', isCorrect: true },
      ],
    },
  ],
};

describe('submitAttempt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scores by exact set match (partial multi-answer is wrong)', async () => {
    db.assessmentQuiz.findFirst.mockResolvedValue(QUIZ);
    db.cohortMembership.findFirst.mockResolvedValue({ id: 'm1' });
    db.assessmentAttempt.findFirst.mockResolvedValue(null);
    db.assessmentAttempt.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'att-1', submittedAt: new Date(), ...data }),
    );

    const res = await submitAttempt('student-1', 'quiz-1', [[1], [0]]);
    expect(res.score).toBe(1); // Q1 right, Q2 missed option c
    expect(res.total).toBe(2);
  });

  it('rejects a second active submission with 409', async () => {
    db.assessmentQuiz.findFirst.mockResolvedValue(QUIZ);
    db.cohortMembership.findFirst.mockResolvedValue({ id: 'm1' });
    db.assessmentAttempt.findFirst.mockResolvedValue({ id: 'att-0' });
    await expect(submitAttempt('student-1', 'quiz-1', [[1], [0, 2]])).rejects.toThrow(
      'already submitted',
    );
  });

  it('only looks for ACTIVE (non reset) attempts so a reset allows retry', async () => {
    db.assessmentQuiz.findFirst.mockResolvedValue(QUIZ);
    db.cohortMembership.findFirst.mockResolvedValue({ id: 'm1' });
    db.assessmentAttempt.findFirst.mockResolvedValue(null);
    db.assessmentAttempt.create.mockResolvedValue({ id: 'att-2', score: 2, total: 2 });
    await submitAttempt('student-1', 'quiz-1', [[1], [0, 2]]);
    expect(db.assessmentAttempt.findFirst).toHaveBeenCalledWith({
      where: { quizId: 'quiz-1', cohortMembershipId: 'm1', supersededAt: null },
    });
  });

  it('rejects wrong answer list length with 400', async () => {
    db.assessmentQuiz.findFirst.mockResolvedValue(QUIZ);
    db.cohortMembership.findFirst.mockResolvedValue({ id: 'm1' });
    db.assessmentAttempt.findFirst.mockResolvedValue(null);
    await expect(submitAttempt('student-1', 'quiz-1', [[1]])).rejects.toThrow('every question');
  });
});

describe('updateQuiz', () => {
  beforeEach(() => vi.clearAllMocks());

  it('locks questions once any attempt exists', async () => {
    db.assessmentQuiz.findFirst.mockResolvedValue({ ...QUIZ, cohort: { tutorId: 'tutor-1' } });
    db.assessmentAttempt.count.mockResolvedValue(1);
    await expect(updateQuiz('tutor-1', 'quiz-1', { questions: QUIZ.questions })).rejects.toThrow(
      'locked',
    );
    expect(db.assessmentQuiz.update).not.toHaveBeenCalled();
  });

  it('still allows title and instructions after submissions', async () => {
    db.assessmentQuiz.findFirst.mockResolvedValue({ ...QUIZ, cohort: { tutorId: 'tutor-1' } });
    db.assessmentQuiz.update.mockResolvedValue({ id: 'quiz-1' });
    await updateQuiz('tutor-1', 'quiz-1', { title: 'New', instructions: 'Read' });
    expect(db.assessmentAttempt.count).not.toHaveBeenCalled();
    expect(db.assessmentQuiz.update).toHaveBeenCalledWith({
      where: { id: 'quiz-1' },
      data: { title: 'New', instructions: 'Read' },
    });
  });

  it('rejects another tutor with 403', async () => {
    db.assessmentQuiz.findFirst.mockResolvedValue({ ...QUIZ, cohort: { tutorId: 'tutor-9' } });
    await expect(updateQuiz('tutor-1', 'quiz-1', { title: 'x' })).rejects.toThrow('Not authorized');
  });
});

describe('resetAttempt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('supersedes the attempt instead of deleting it', async () => {
    db.assessmentAttempt.findUnique.mockResolvedValue({
      id: 'att-1',
      supersededAt: null,
      quiz: { deletedAt: null, cohort: { tutorId: 'tutor-1' } },
    });
    db.assessmentAttempt.update.mockResolvedValue({});
    await resetAttempt('tutor-1', 'att-1');
    const arg = db.assessmentAttempt.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'att-1' });
    expect(arg.data.supersededAt).toBeInstanceOf(Date);
  });

  it('rejects another tutor and double reset', async () => {
    db.assessmentAttempt.findUnique.mockResolvedValue({
      id: 'att-1',
      supersededAt: null,
      quiz: { deletedAt: null, cohort: { tutorId: 'tutor-9' } },
    });
    await expect(resetAttempt('tutor-1', 'att-1')).rejects.toThrow('Not authorized');

    db.assessmentAttempt.findUnique.mockResolvedValue({
      id: 'att-1',
      supersededAt: new Date(),
      quiz: { deletedAt: null, cohort: { tutorId: 'tutor-1' } },
    });
    await expect(resetAttempt('tutor-1', 'att-1')).rejects.toThrow('already reset');
  });
});

describe('getAssessmentHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.assessmentAttempt.findMany.mockResolvedValue([]);
  });

  it('limits a PARENT to linked ACTIVE children', async () => {
    await getAssessmentHistory('parent-profile-1', 'PARENT', {});
    const where = db.assessmentAttempt.findMany.mock.calls[0][0].where;
    expect(where.cohortMembership.student.guardianRelationships).toEqual({
      some: { parentId: 'parent-profile-1', status: 'ACTIVE' },
    });
  });

  it('lets ADMIN search by name, email or phone with no guardian limit', async () => {
    await getAssessmentHistory('admin-1', 'ADMIN', { q: 's6' });
    const student = db.assessmentAttempt.findMany.mock.calls[0][0].where.cohortMembership.student;
    expect(student.guardianRelationships).toBeUndefined();
    expect(student.user.OR).toHaveLength(3);
  });

  it('rejects TUTOR and STUDENT with 403', async () => {
    await expect(getAssessmentHistory('t1', 'TUTOR', {})).rejects.toThrow('Not authorized');
    await expect(getAssessmentHistory('s1', 'STUDENT', {})).rejects.toThrow('Not authorized');
  });

  it('marks reset attempts and deleted quizzes and falls back to email for the name', async () => {
    db.assessmentAttempt.findMany.mockResolvedValue([
      {
        id: 'att-1',
        quizId: 'quiz-1',
        score: 2,
        total: 3,
        submittedAt: new Date(),
        supersededAt: new Date(),
        quiz: { cohortId: 'c1', title: 'Week 1', weekStartDate: new Date(), deletedAt: new Date() },
        cohortMembership: {
          studentId: 'stu-1',
          student: { user: { name: null, email: 's6@test.local' } },
        },
      },
    ]);
    const rows = await getAssessmentHistory('admin-1', 'ADMIN', {});
    expect(rows[0]).toMatchObject({
      studentName: 's6@test.local',
      quizDeleted: true,
      score: 2,
      total: 3,
    });
    expect(rows[0].supersededAt).not.toBeNull();
  });
});
