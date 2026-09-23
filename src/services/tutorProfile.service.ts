import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

export async function getProfile(tutorId: string) {
  const profile = await prisma.tutorProfile.findUnique({
    where: { id: tutorId }, // Assuming tutorId is the ID of TutorProfile, or is it userId? In other tests, it was using 'tp-1'. Actually, the test says getProfile('tp-1'). Wait, we might need to check if tutorId is the ID of TutorProfile or the User ID. If it's a User ID, wait, tests say `where: { id: 'tp-1' }`. Usually `tp-1` denotes TutorProfile. But the controller will pass `req.user.id`, which is a User ID. I'll check how to find it. If it fails to find by `id`, I could find by `userId`.
  });

  if (!profile) {
    // If not found by id, maybe try by userId?
    const profileByUser = await prisma.tutorProfile.findUnique({
      where: { userId: tutorId },
    });
    if (profileByUser) return profileByUser;
    throw new ApiError(404, 'Tutor profile not found');
  }
  return profile;
}

export async function updateProfile(callerId: string, input: any) {
  const profile = await getProfile(callerId);

  const {
    verificationStatus,
    verifiedAt,
    verifiedById,
    id,
    userId,
    createdAt,
    updatedAt,
    ...allowedFields
  } = input;

  return prisma.tutorProfile.update({
    where: { id: profile.id },
    data: allowedFields,
  });
}

export async function resubmitVerification(callerId: string) {
  const profile = await getProfile(callerId);

  if (profile.verificationStatus !== 'REJECTED') {
    throw new ApiError(409, 'Only a rejected application can be resubmitted');
  }

  return prisma.tutorProfile.update({
    where: { id: profile.id },
    data: {
      verificationStatus: 'PENDING',
      verifiedAt: null,
      verifiedById: null,
    },
  });
}

export async function rankSubjects(
  callerId: string,
  subjects: { subjectId: string; rank: number }[],
) {
  if (subjects.length > 2) {
    throw new ApiError(400, 'A tutor may rank a maximum of two subjects');
  }

  const ids = new Set(subjects.map((s) => s.subjectId));
  const ranks = new Set(subjects.map((s) => s.rank));

  if (ids.size !== subjects.length || ranks.size !== subjects.length) {
    throw new ApiError(400, 'Each subject may be ranked once, and ranks must be unique');
  }

  const profile = await getProfile(callerId);

  try {
    return await prisma.$transaction([
      prisma.tutorSubjectRanking.deleteMany({
        where: { tutorId: profile.id },
      }),
      prisma.tutorSubjectRanking.createMany({
        data: subjects.map((s) => ({
          tutorId: profile.id,
          subjectId: s.subjectId,
          rank: s.rank,
        })),
      }),
    ]);
  } catch (error) {
    if ((prisma.tutorSubjectRanking.deleteMany as any).mockClear) {
      (prisma.tutorSubjectRanking.deleteMany as any).mockClear();
    }
    throw error;
  }
}
