import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

interface QuizOption {
  text: string;
  isCorrect: boolean;
}
interface QuizQuestion {
  text: string;
  options: QuizOption[];
}

const DUPLICATE_MSG = 'A quiz for this week has already been created';

function parseWeek(weekStartDate: string): Date {
  const d = new Date(weekStartDate);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, 'weekStartDate must be a valid date');
  return d;
}

function hideAnswers(questions: QuizQuestion[]) {
  return questions.map((q) => ({
    text: q.text,
    options: q.options.map((o) => ({ text: o.text })),
  }));
}

function studentName(student: any): string {
  return student?.firstName ?? String(student?.user?.name ?? '').split(' ')[0];
}

export async function createQuiz(
  tutorId: string,
  data: {
    cohortId: string;
    weekStartDate: string;
    title?: string;
    instructions: string;
    questions: QuizQuestion[];
  },
) {
  const cohort = await prisma.cohort.findUnique({ where: { id: data.cohortId } });
  if (!cohort || cohort.tutorId !== tutorId) throw new ApiError(403, 'Not authorized');

  const weekStart = parseWeek(data.weekStartDate);
  const existing = await prisma.assessmentQuiz.findUnique({
    where: { cohortId_weekStartDate: { cohortId: data.cohortId, weekStartDate: weekStart } },
  });
  if (existing) throw new ApiError(409, DUPLICATE_MSG);

  try {
    return await prisma.assessmentQuiz.create({
      data: {
        cohortId: data.cohortId,
        weekStartDate: weekStart,
        title: data.title,
        instructions: data.instructions,
        questions: data.questions as any,
        createdByTutorId: tutorId,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw new ApiError(409, DUPLICATE_MSG);
    throw e;
  }
}

export async function getQuizzesForCohort(callerId: string, role: string, cohortId: string) {
  const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
  if (!cohort) throw new ApiError(404, 'Cohort not found');

  if (role === 'TUTOR') {
    if (cohort.tutorId !== callerId) throw new ApiError(403, 'Not authorized');
    const quizzes = await prisma.assessmentQuiz.findMany({
      where: { cohortId },
      orderBy: { weekStartDate: 'desc' },
      include: {
        attempts: {
          include: { cohortMembership: { include: { student: { include: { user: true } } } } },
        },
      },
    });
    return quizzes.map((q) => ({
      id: q.id,
      weekStartDate: q.weekStartDate,
      title: q.title,
      instructions: q.instructions,
      questions: q.questions,
      attempts: q.attempts.map((a) => ({
        id: a.id,
        studentId: a.cohortMembership.studentId,
        studentName: studentName(a.cohortMembership.student),
        score: a.score,
        total: a.total,
        submittedAt: a.submittedAt,
      })),
    }));
  }

  if (role === 'STUDENT') {
    const membership = await prisma.cohortMembership.findFirst({
      where: { cohortId, studentId: callerId, status: { not: 'ENDED' } },
    });
    if (!membership) throw new ApiError(403, 'Not authorized');
    const quizzes = await prisma.assessmentQuiz.findMany({
      where: { cohortId },
      orderBy: { weekStartDate: 'desc' },
      include: { attempts: { where: { cohortMembershipId: membership.id } } },
    });
    return quizzes.map((q) => {
      const attempt = q.attempts[0] ?? null;
      const questions = q.questions as unknown as QuizQuestion[];
      return {
        id: q.id,
        weekStartDate: q.weekStartDate,
        title: q.title,
        instructions: q.instructions,
        // Correct answers are revealed only after the student has submitted.
        questions: attempt ? questions : hideAnswers(questions),
        myAttempt: attempt
          ? {
              answers: attempt.answers,
              score: attempt.score,
              total: attempt.total,
              submittedAt: attempt.submittedAt,
            }
          : null,
      };
    });
  }

  throw new ApiError(403, 'Not authorized');
}

export async function submitAttempt(studentId: string, quizId: string, answers: number[][]) {
  const quiz = await prisma.assessmentQuiz.findUnique({ where: { id: quizId } });
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  const membership = await prisma.cohortMembership.findFirst({
    where: { cohortId: quiz.cohortId, studentId, status: 'ACTIVE' },
  });
  if (!membership) throw new ApiError(403, 'Not authorized');

  const already = await prisma.assessmentAttempt.findUnique({
    where: { quizId_cohortMembershipId: { quizId, cohortMembershipId: membership.id } },
  });
  if (already) throw new ApiError(409, 'You have already submitted this assessment');

  const questions = quiz.questions as unknown as QuizQuestion[];
  if (answers.length !== questions.length) {
    throw new ApiError(400, 'Provide an answer list for every question');
  }

  let score = 0;
  questions.forEach((q, i) => {
    const picked = new Set(answers[i]);
    for (const idx of picked) {
      if (idx >= q.options.length) throw new ApiError(400, 'Invalid option selected');
    }
    const correct = q.options.flatMap((o, idx) => (o.isCorrect ? [idx] : []));
    if (correct.length === picked.size && correct.every((idx) => picked.has(idx))) score += 1;
  });

  try {
    const attempt = await prisma.assessmentAttempt.create({
      data: {
        quizId,
        cohortMembershipId: membership.id,
        answers: answers as any,
        score,
        total: questions.length,
      },
    });
    return {
      id: attempt.id,
      score: attempt.score,
      total: attempt.total,
      submittedAt: attempt.submittedAt,
      answers,
      questions,
    };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new ApiError(409, 'You have already submitted this assessment');
    }
    throw e;
  }
}
