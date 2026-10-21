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
  return (
    String(student?.firstName ?? '').trim() ||
    String(student?.user?.name ?? '')
      .trim()
      .split(' ')[0] ||
    student?.user?.email ||
    'Student'
  );
}

function tutorName(tutor: any): string {
  return (
    String(tutor?.user?.name ?? '').trim() ||
    String(tutor?.firstName ?? '').trim() ||
    tutor?.user?.email ||
    'Tutor'
  );
}

async function findOwnedQuiz(tutorId: string, quizId: string) {
  const quiz = await prisma.assessmentQuiz.findFirst({
    where: { id: quizId, deletedAt: null },
    include: { cohort: true },
  });
  if (!quiz) throw new ApiError(404, 'Quiz not found');
  if (quiz.cohort.tutorId !== tutorId) throw new ApiError(403, 'Not authorized');
  return quiz;
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
  const existing = await prisma.assessmentQuiz.findFirst({
    where: { cohortId: data.cohortId, weekStartDate: weekStart, deletedAt: null },
  });
  if (existing) throw new ApiError(409, DUPLICATE_MSG);

  return prisma.assessmentQuiz.create({
    data: {
      cohortId: data.cohortId,
      weekStartDate: weekStart,
      title: data.title || null,
      instructions: data.instructions,
      questions: data.questions as any,
      createdByTutorId: tutorId,
    },
  });
}

export async function updateQuiz(
  tutorId: string,
  quizId: string,
  data: { title?: string; instructions?: string; questions?: QuizQuestion[] },
) {
  await findOwnedQuiz(tutorId, quizId);

  if (data.questions) {
    // Any attempt (even a reset one) is history that refers to these questions.
    const attempts = await prisma.assessmentAttempt.count({ where: { quizId } });
    if (attempts > 0) throw new ApiError(409, 'Questions are locked once students have submitted');
  }

  return prisma.assessmentQuiz.update({
    where: { id: quizId },
    data: {
      ...(data.title !== undefined ? { title: data.title || null } : {}),
      ...(data.instructions !== undefined ? { instructions: data.instructions } : {}),
      ...(data.questions ? { questions: data.questions as any } : {}),
    },
  });
}

// Soft delete: hidden from tutor and students, kept for admin/parent history.
export async function deleteQuiz(tutorId: string, quizId: string) {
  await findOwnedQuiz(tutorId, quizId);
  await prisma.assessmentQuiz.update({ where: { id: quizId }, data: { deletedAt: new Date() } });
  return { id: quizId };
}

// Lets the student retry. The old attempt stays as history (supersededAt set).
export async function resetAttempt(tutorId: string, attemptId: string) {
  const attempt = await prisma.assessmentAttempt.findUnique({
    where: { id: attemptId },
    include: { quiz: { include: { cohort: true } } },
  });
  if (!attempt || attempt.quiz.deletedAt) throw new ApiError(404, 'Attempt not found');
  if (attempt.quiz.cohort.tutorId !== tutorId) throw new ApiError(403, 'Not authorized');
  if (attempt.supersededAt) throw new ApiError(409, 'This attempt was already reset');

  await prisma.assessmentAttempt.update({
    where: { id: attemptId },
    data: { supersededAt: new Date() },
  });
  return { id: attemptId };
}

export async function getQuizzesForCohort(callerId: string, role: string, cohortId: string) {
  const cohort = await prisma.cohort.findUnique({ where: { id: cohortId } });
  if (!cohort) throw new ApiError(404, 'Cohort not found');

  if (role === 'TUTOR') {
    if (cohort.tutorId !== callerId) throw new ApiError(403, 'Not authorized');
    const quizzes = await prisma.assessmentQuiz.findMany({
      where: { cohortId, deletedAt: null },
      orderBy: { weekStartDate: 'desc' },
      include: {
        attempts: {
          orderBy: { submittedAt: 'asc' },
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
        supersededAt: a.supersededAt,
      })),
    }));
  }

  if (role === 'STUDENT') {
    const membership = await prisma.cohortMembership.findFirst({
      where: { cohortId, studentId: callerId, status: { not: 'ENDED' } },
    });
    if (!membership) throw new ApiError(403, 'Not authorized');
    const quizzes = await prisma.assessmentQuiz.findMany({
      where: { cohortId, deletedAt: null },
      orderBy: { weekStartDate: 'desc' },
      include: {
        attempts: { where: { cohortMembershipId: membership.id }, orderBy: { submittedAt: 'asc' } },
      },
    });
    return quizzes.map((q) => {
      const active = q.attempts.find((a) => a.supersededAt === null) ?? null;
      const questions = q.questions as unknown as QuizQuestion[];
      return {
        id: q.id,
        weekStartDate: q.weekStartDate,
        title: q.title,
        instructions: q.instructions,
        // Correct answers are revealed only while the student has an active submission.
        questions: active ? questions : hideAnswers(questions),
        myAttempt: active
          ? {
              answers: active.answers,
              score: active.score,
              total: active.total,
              submittedAt: active.submittedAt,
            }
          : null,
        previousAttempts: q.attempts
          .filter((a) => a.supersededAt !== null)
          .map((a) => ({
            score: a.score,
            total: a.total,
            submittedAt: a.submittedAt,
            supersededAt: a.supersededAt,
          })),
      };
    });
  }

  throw new ApiError(403, 'Not authorized');
}

export async function submitAttempt(studentId: string, quizId: string, answers: number[][]) {
  const quiz = await prisma.assessmentQuiz.findFirst({ where: { id: quizId, deletedAt: null } });
  if (!quiz) throw new ApiError(404, 'Quiz not found');

  const membership = await prisma.cohortMembership.findFirst({
    where: { cohortId: quiz.cohortId, studentId, status: 'ACTIVE' },
  });
  if (!membership) throw new ApiError(403, 'Not authorized');

  const already = await prisma.assessmentAttempt.findFirst({
    where: { quizId, cohortMembershipId: membership.id, supersededAt: null },
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
}

// ADMIN: every student (optional search). PARENT: only linked ACTIVE children.
// Includes reset attempts and attempts on deleted quizzes (history is never lost).
export async function getAssessmentHistory(
  callerId: string,
  role: string,
  filters: { q?: string; studentId?: string },
) {
  if (role !== 'ADMIN' && role !== 'PARENT') throw new ApiError(403, 'Not authorized');

  const studentWhere: any = {};
  if (role === 'PARENT') {
    studentWhere.guardianRelationships = { some: { parentId: callerId, status: 'ACTIVE' } };
  }
  if (filters.q) {
    studentWhere.user = {
      OR: [
        { email: { contains: filters.q, mode: 'insensitive' } },
        { phone: { contains: filters.q } },
        { name: { contains: filters.q, mode: 'insensitive' } },
      ],
    };
  }

  const attempts = await prisma.assessmentAttempt.findMany({
    where: {
      cohortMembership: {
        ...(filters.studentId ? { studentId: filters.studentId } : {}),
        student: studentWhere,
      },
    },
    orderBy: { submittedAt: 'desc' },
    take: 200,
    include: {
      quiz: { include: { cohort: { include: { tutor: { include: { user: true } } } } } },
      cohortMembership: { include: { student: { include: { user: true } } } },
    },
  });

  return attempts.map((a) => ({
    attemptId: a.id,
    studentId: a.cohortMembership.studentId,
    studentName: studentName(a.cohortMembership.student),
    studentEmail: (a.cohortMembership.student as any)?.user?.email ?? null,
    cohortId: a.quiz.cohortId,
    quizId: a.quizId,
    quizTitle: a.quiz.title,
    weekStartDate: a.quiz.weekStartDate,
    quizDeleted: a.quiz.deletedAt !== null,
    tutorName: tutorName((a.quiz as any).cohort?.tutor),
    tutorEmail: (a.quiz as any).cohort?.tutor?.user?.email ?? null,
    score: a.score,
    total: a.total,
    submittedAt: a.submittedAt,
    supersededAt: a.supersededAt,
  }));
}
