// src/services/adminPeople.service.ts
import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { record as recordAuditLog } from './auditLog.service.js';
import { handleSoleGuardianRemoval } from './guardianship.service.js';

export async function listUsers(
  role?: string,
  search?: string,
  page: number = 1,
  limit: number = 20,
) {
  try {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const skip = (safePage - 1) * safeLimit;

    let where: any = {};
    if (role) where.role = role;

    if (search) {
      const searchString = typeof search === 'string' ? search : String(search);
      where.OR = [
        { email: { contains: searchString, mode: 'insensitive' } },
        { phone: { contains: searchString, mode: 'insensitive' } },
        { name: { contains: searchString, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: safeLimit,
      }),
      prisma.user.count({
        where,
      }),
    ]);

    return { items, page: safePage, limit: safeLimit, total };
  } catch (error) {
    // A02:2021 — Cryptographic Failures: Never write raw contact info or search terms to logs on error
    throw new Error('An error occurred while fetching users');
  }
}

export async function manageRelationshipRecords(
  relationshipId: string,
  adminId: string,
  updates: any,
) {
  const rel = await prisma.parentStudentRelationship.findUnique({ where: { id: relationshipId } });
  if (!rel) throw new ApiError(404, 'Relationship not found');

  if (updates.status === 'REVOKED' && rel.relationshipType === 'MANDATORY_GUARDIAN') {
    return handleSoleGuardianRemoval({ relationshipId });
  }

  const updated = await prisma.parentStudentRelationship.update({
    where: { id: relationshipId },
    data: updates,
  });

  return updated;
}

export async function suspendAccount(
  userId: string,
  adminId: string,
  reason: string,
  restrictionType: string,
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  // We added status to User in schema.prisma. Let's update it.
  await prisma.user.update({
    where: { id: userId },
    data: { status: restrictionType as any },
  });

  const tutorProfile = await prisma.tutorProfile.findUnique({ where: { userId } });
  let affectedCohortIds: string[] | undefined = undefined;

  if (tutorProfile) {
    // The tutor↔cohort link lives on `Cohort.tutorId` (FK → TutorProfile.id),
    // not on CohortMembership — that model links a student to a cohort.
    // Query Cohort directly; the persistence suite seeds Cohort rows with
    // no CohortMembership rows at all, so any membership-based query would
    // return zero regardless of how its where clause is shaped.
    const activeCohorts = await prisma.cohort.findMany({
      where: { tutorId: tutorProfile.id, status: 'ACTIVE' },
      select: { id: true },
    });

    if (activeCohorts.length > 0) {
      affectedCohortIds = activeCohorts.map((c) => c.id);
    }
  }

  const action = restrictionType === 'SUSPENDED' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_RESTRICTED';

  await recordAuditLog({
    actor: adminId,
    action,
    target: userId,
    timestamp: new Date(),
  });

  if (affectedCohortIds) {
    return { affectedCohortIds };
  }

  return { success: true };
}
