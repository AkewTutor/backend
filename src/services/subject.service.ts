import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

export async function listSubjects(includeInactive: boolean = false) {
  const where = includeInactive ? {} : { isActive: true };
  return prisma.subject.findMany({ where });
}

export async function createSubject(name: string) {
  try {
    return await prisma.subject.create({
      data: { name },
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new ApiError(409, 'A subject with this name already exists');
    }
    throw error;
  }
}

export async function deactivateSubject(subjectId: string, isActive: boolean) {
  return prisma.subject.update({
    where: { id: subjectId },
    data: { isActive },
  });
}
