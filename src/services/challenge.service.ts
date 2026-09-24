import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/index.js';

export const createChallenge = async (data: any, adminId: string) => {
  if (new Date(data.endsAt) <= new Date(data.startsAt)) {
    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'End time must be after start time');
  }

  return await prisma.challenge.create({
    data: {
      ...data,
      createdById: adminId,
    },
  });
};

export const listActiveChallenges = async () => {
  const now = new Date();
  return await prisma.challenge.findMany({
    where: {
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
  });
};

export const trackProgress = async (studentId: string, challengeId: string, increment: number) => {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) {
    throw new Error('Challenge not found');
  }

  const existing = await prisma.challengeProgress.findUnique({
    where: { studentId_challengeId: { studentId, challengeId } },
  });

  const newProgress = (existing?.progressValue || 0) + increment;
  let newCompletedAt = existing?.completedAt || null;

  if (newProgress >= challenge.targetValue && !newCompletedAt) {
    newCompletedAt = new Date();
  }

  return await prisma.challengeProgress.upsert({
    where: { studentId_challengeId: { studentId, challengeId } },
    update: {
      progressValue: newProgress,
      completedAt: newCompletedAt,
    },
    create: {
      studentId,
      challengeId,
      progressValue: newProgress,
      completedAt: newCompletedAt,
    },
  });
};

export const getMyProgress = async (
  callerId: string,
  callerRole: string,
  targetStudentId?: string,
) => {
  let studentId = callerId;

  if (callerRole === 'PARENT') {
    if (!targetStudentId) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'studentId required for parents');
    }
    const rel = await prisma.parentStudentRelationship.findUnique({
      where: { parentId_studentId: { parentId: callerId, studentId: targetStudentId } },
    });
    if (!rel || rel.status !== 'ACTIVE') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Not authorized');
    }
    studentId = targetStudentId;
  }

  return {
    progress: await prisma.challengeProgress.findMany({
      where: { studentId },
      include: { challenge: true },
    }),
  };
};
