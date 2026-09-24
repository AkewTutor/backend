import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/index.js';

export const awardStudentBadge = async (studentId: string, badgeId: string) => {
  const existing = await prisma.studentBadge.findUnique({
    where: { studentId_badgeId: { studentId, badgeId } },
  });

  if (existing) {
    return existing; // Silent no-op per test "flagged, not hard-asserted"
  }

  const result = await prisma.studentBadge.create({
    data: {
      studentId,
      badgeId,
    },
    include: {
      badge: true,
    },
  });

  return result;
};

export const awardTutorBadge = async (tutorId: string, badgeId: string) => {
  const existing = await prisma.tutorBadge.findUnique({
    where: { tutorId_badgeId: { tutorId, badgeId } },
  });

  if (existing) {
    return existing;
  }

  const result = await prisma.tutorBadge.create({
    data: {
      tutorId,
      badgeId,
    },
    include: {
      badge: true,
    },
  });

  return result;
};

export const createBadge = async (data: {
  name: string;
  description: string;
  category: 'STUDENT' | 'TUTOR';
  criteriaDescription: string;
  isActive?: boolean;
}) => {
  const result = await prisma.badge.create({
    data: {
      name: data.name,
      description: data.description,
      category: data.category,
      criteriaDescription: data.criteriaDescription,
      isActive: data.isActive !== undefined ? data.isActive : true,
    },
  });
  return result;
};

export async function adminManageBadges(
  page: number,
  limit: number,
  category: 'STUDENT' | 'TUTOR',
): Promise<any>;
export async function adminManageBadges(
  badgeId: string,
  payload: { isActive?: boolean; criteriaDescription?: string },
): Promise<any>;
export async function adminManageBadges(arg1: any, arg2: any, arg3?: any): Promise<any> {
  if (typeof arg1 === 'number') {
    // List mode
    const page = arg1;
    const limit = arg2;
    const category = arg3;
    const skip = (page - 1) * limit;

    const badges = await prisma.badge.findMany({
      where: category ? { category } : undefined,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.badge.count({
      where: category ? { category } : undefined,
    });

    return { badges, page, limit, total };
  } else {
    // Adjust mode
    const badgeId = arg1;
    const payload = arg2;
    return await prisma.badge.update({
      where: { id: badgeId },
      data: payload,
    });
  }
}

export const listMyBadges = async (
  callerId: string,
  callerRole: string,
  targetStudentId?: string,
) => {
  if (callerRole === 'STUDENT') {
    return {
      badges: await prisma.studentBadge.findMany({
        where: { studentId: callerId },
        include: { badge: true },
      }),
    };
  }

  if (callerRole === 'PARENT') {
    if (!targetStudentId) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'targetStudentId is required');
    }

    // Check IDOR
    const rel = await prisma.parentStudentRelationship.findUnique({
      where: { parentId_studentId: { parentId: callerId, studentId: targetStudentId } },
    });

    if (!rel || rel.status !== 'ACTIVE') {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Not authorized for this student');
    }

    return {
      badges: await prisma.studentBadge.findMany({
        where: { studentId: targetStudentId },
        include: { badge: true },
      }),
    };
  }

  if (callerRole === 'TUTOR') {
    return {
      badges: await prisma.tutorBadge.findMany({
        where: { tutorId: callerId },
        include: { badge: true },
      }),
    };
  }

  throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Invalid role for badges');
};
