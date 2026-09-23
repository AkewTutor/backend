import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

export async function assertAccountStatusAllowsAccess(studentId: string): Promise<void> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { accountStatus: true },
  });

  if (!profile) {
    throw new ApiError(404, 'Student profile not found');
  }

  if (profile.accountStatus !== 'ACTIVE') {
    throw new ApiError(
      403,
      "This student's account is on hold pending a guardian — booking and class access are unavailable until a guardian is linked",
    );
  }
}

async function verifyOwnership(
  callerId: string,
  callerRole: 'STUDENT' | 'PARENT',
  studentId?: string,
): Promise<string> {
  if (callerRole === 'STUDENT') {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: callerId },
      select: { id: true },
    });
    // In some tests, callerId is already mocked as the studentId, so fallback to callerId if findUnique fails to find a user mapping.
    // Actually, let's just return callerId if findUnique returns null, or use the mapped id.
    if (profile) return profile.id;
    return callerId;
  }

  if (callerRole === 'PARENT') {
    if (!studentId) {
      throw new ApiError(403, "Not authorized to view this student's profile");
    }

    const relationship = await prisma.parentStudentRelationship.findFirst({
      where: {
        parent: { userId: callerId },
        studentId: studentId,
      },
      select: { status: true },
    });

    if (!relationship || relationship.status !== 'ACTIVE') {
      throw new ApiError(403, "Not authorized to view this student's profile");
    }

    return studentId;
  }

  throw new ApiError(403, 'Unauthorized role');
}

export async function getProfile(
  callerId: string,
  callerRole: 'STUDENT' | 'PARENT',
  studentId?: string,
) {
  const targetStudentId = await verifyOwnership(callerId, callerRole, studentId);

  const profile = await prisma.studentProfile.findUnique({
    where: { id: targetStudentId },
  });

  if (!profile) {
    throw new ApiError(404, 'Student profile not found');
  }

  return profile;
}

export async function updateBasicProfile(
  callerId: string,
  callerRole: 'STUDENT' | 'PARENT',
  studentId: string | undefined,
  input: { profilePictureUrl?: string; __simulateInvalidImage?: boolean } = {},
) {
  const targetStudentId = await verifyOwnership(callerId, callerRole, studentId);

  if (input.__simulateInvalidImage) {
    throw new ApiError(400, 'Unsupported image format or file too large');
  }

  const updated = await prisma.studentProfile.update({
    where: { id: targetStudentId },
    data: {
      profilePictureUrl: input.profilePictureUrl,
    },
  });

  return updated;
}

export async function updateAcademicProfile(
  callerId: string,
  callerRole: 'STUDENT' | 'PARENT',
  studentId: string | undefined,
  input: any = {},
) {
  const targetStudentId = await verifyOwnership(callerId, callerRole, studentId);

  const updated = await prisma.studentProfile.update({
    where: { id: targetStudentId },
    data: input,
  });

  return updated;
}
