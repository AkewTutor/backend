import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { dispatchNotification } from './notification.service.js';
import { record as recordAuditLog } from './auditLog.service.js';
import { hashPassword } from '../utils/password.js';
import crypto from 'crypto';
import { signAccessToken } from '../utils/jwt.js';

// TODO: share with auth.service.ts DEFAULT_PREFERRED_LANGUAGE (same placeholder value)
const DEFAULT_PREFERRED_LANGUAGE = 'English';

export { assertAccountStatusAllowsAccess } from './studentProfile.service.js';

export async function addStudentAndInvite(
  parentUserId: string,
  grade: number,
  inviteContact: string,
) {
  if (grade >= 6) {
    throw new ApiError(
      400,
      'Grades 6–12 students register independently — see /auth/register/student',
    );
  }

  const parent = await prisma.parentProfile.findUnique({ where: { userId: parentUserId } });
  if (!parent) {
    throw new ApiError(404, 'Parent profile not found');
  }

  const studentProfileId = crypto.randomUUID();
  const newUserId = crypto.randomUUID();
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const isEmail = inviteContact.includes('@');

  const result = await prisma.$transaction([
    prisma.studentProfile.create({
      data: {
        id: studentProfileId,
        grade,
        preferredLanguage: DEFAULT_PREFERRED_LANGUAGE,
        user: {
          create: {
            id: newUserId,
            role: 'STUDENT',
            email: isEmail ? inviteContact : null,
            phone: !isEmail ? inviteContact : null,
            passwordHash: 'placeholder',
            termsAcceptedAt: new Date(),
          },
        },
      } as any,
    }),
    prisma.parentStudentRelationship.create({
      data: {
        parentId: parent.id,
        studentId: studentProfileId,
        relationshipType: 'MANDATORY_GUARDIAN',
        status: 'INVITED',
        inviteToken,
        inviteExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      } as any,
    }),
  ]);

  const channel = isEmail ? 'EMAIL' : 'SMS';
  await dispatchNotification(newUserId, 'GUARDIAN_INVITE', { channel, inviteContact, inviteToken });

  return { studentProfileId: result[0].id, relationshipId: result[1].id };
}

export async function inviteOptionalGuardian(userId: string, inviteContact: string) {
  const profile = await prisma.studentProfile.findUnique({ where: { userId } });
  if (!profile || profile.grade < 6) {
    throw new ApiError(403, 'This action is only available to Grade 6–12 students');
  }

  const inviteToken = crypto.randomBytes(32).toString('hex');
  const isEmail = inviteContact.includes('@');
  const guardianProfileId = crypto.randomUUID();
  const guardianUserId = crypto.randomUUID();

  // The invited contact may already be a registered parent: link to that account
  // instead of creating a placeholder (which would violate the unique email/phone).
  const existing = await prisma.user.findFirst({
    where: isEmail ? { email: inviteContact } : { phone: inviteContact },
    include: { parentProfile: true },
  });
  if (existing && (existing.role !== 'PARENT' || !existing.parentProfile)) {
    throw new ApiError(
      409,
      'This contact belongs to an account that cannot be invited as a guardian',
    );
  }
  if (existing?.parentProfile) {
    const dup = await prisma.parentStudentRelationship.findFirst({
      where: {
        studentId: profile.id,
        parentId: existing.parentProfile.id,
        status: { in: ['INVITED', 'ACTIVE'] },
      },
    });
    if (dup) throw new ApiError(409, 'This guardian is already linked or invited');
  }

  const relData = {
    studentId: profile.id,
    relationshipType: 'OPTIONAL_GUARDIAN',
    status: 'INVITED',
    inviteToken,
    inviteExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  } as any;

  let result;
  if (existing?.parentProfile) {
    result = await prisma.parentStudentRelationship.create({
      data: { ...relData, parentId: existing.parentProfile.id },
    });
  } else {
    // No account yet: create a placeholder parent user/profile (same pattern as
    // addStudentAndInvite) so the relationship FK is satisfied.
    [, result] = await prisma.$transaction([
      prisma.parentProfile.create({
        data: {
          id: guardianProfileId,
          user: {
            create: {
              id: guardianUserId,
              role: 'PARENT',
              email: isEmail ? inviteContact : null,
              phone: !isEmail ? inviteContact : null,
              passwordHash: 'placeholder',
              termsAcceptedAt: new Date(),
            },
          },
        } as any,
      }),
      prisma.parentStudentRelationship.create({
        data: { ...relData, parentId: guardianProfileId },
      }),
    ]);
  }

  // Notify the invited guardian (not the inviting student).
  const channel = isEmail ? 'EMAIL' : 'SMS';
  await dispatchNotification(existing?.id ?? guardianUserId, 'GUARDIAN_INVITE', {
    channel,
    inviteContact,
    inviteToken,
  });

  return {
    relationshipId: result.id,
    relationshipType: result.relationshipType,
    status: result.status,
  };
}

export async function revokeOrModifyRelationship(
  callerId: string,
  callerRole: string,
  relationshipId: string,
  input: any,
) {
  const rel = await prisma.parentStudentRelationship.findUnique({ where: { id: relationshipId } });
  if (!rel) throw new ApiError(403, 'Not authorized to modify this relationship');

  if (callerRole === 'PARENT') {
    const parent = await prisma.parentProfile.findUnique({ where: { userId: callerId } });
    if (!parent || rel.parentId !== parent.id) {
      throw new ApiError(403, 'Not authorized to modify this relationship');
    }
  }

  if (callerRole === 'STUDENT') {
    if (rel.relationshipType === 'MANDATORY_GUARDIAN') {
      throw new ApiError(403, 'Only a guardian or Admin can remove this relationship');
    }
    if ((rel as any).initiatedBy !== callerId && rel.studentId !== callerId) {
      const initiatedBy = (rel as any).initiatedBy || rel.studentId;
      if (initiatedBy !== callerId) {
        throw new ApiError(403, 'Not authorized to modify this relationship');
      }
    }
  }

  if (input.revoke === false) {
    return prisma.parentStudentRelationship.update({
      where: { id: relationshipId },
      data: { permissions: input.permissions },
    });
  }

  await recordAuditLog({
    actor: callerId,
    action: 'GUARDIAN_REMOVED',
    target: relationshipId,
    timestamp: new Date(),
  });
  return handleSoleGuardianRemoval({ relationshipId, callerId });
}

export async function handleSoleGuardianRemoval({
  relationshipId,
  callerId,
}: {
  relationshipId: string;
  callerId?: string;
}) {
  const rel = await prisma.parentStudentRelationship.findUnique({ where: { id: relationshipId } });
  if (!rel) throw new ApiError(404, 'Relationship not found');

  const count = await prisma.parentStudentRelationship.count({
    where: { studentId: rel.studentId, relationshipType: 'MANDATORY_GUARDIAN', status: 'ACTIVE' },
  });

  const updatedRel = await prisma.parentStudentRelationship.update({
    where: { id: relationshipId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedById: callerId || null,
    },
  });

  // If this was the last active mandatory guardian
  if (rel.relationshipType === 'MANDATORY_GUARDIAN' && count === 1) {
    await prisma.studentProfile.update({
      where: { id: rel.studentId },
      data: { accountStatus: 'GUARDIAN_REQUIRED_HOLD' },
    });
    return { ...updatedRel, studentAccountStatus: 'GUARDIAN_REQUIRED_HOLD' };
  }

  return updatedRel;
}

export async function resendOrRegenerateInvite(callerId: string, relationshipId: string) {
  const rel = await prisma.parentStudentRelationship.findUnique({
    where: { id: relationshipId },
    include: { student: { include: { user: true } }, parent: { include: { user: true } } },
  });
  if (!rel) throw new ApiError(403, 'Not authorized to manage this invite');

  // The inviter resends: the student for optional-guardian invites, the parent otherwise.
  const isOptional = rel.relationshipType === 'OPTIONAL_GUARDIAN';
  const inviterUserId = isOptional ? rel.student.userId : rel.parent.userId;
  if (inviterUserId !== callerId) {
    throw new ApiError(403, 'Not authorized to manage this invite');
  }
  if (rel.status !== 'INVITED') {
    throw new ApiError(409, 'This invite was already activated or revoked.');
  }

  const updated = await prisma.parentStudentRelationship.update({
    where: { id: relationshipId },
    data: { inviteExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
  });

  // Notify the invitee: the guardian for optional invites, the student otherwise.
  const invitee = isOptional ? rel.parent.user : rel.student.user;
  const contact = invitee.email || invitee.phone || '';
  await dispatchNotification(invitee.id, 'GUARDIAN_INVITE_RESEND', {
    channel: contact.includes('@') ? 'EMAIL' : 'SMS',
    inviteContact: contact,
    inviteToken: rel.inviteToken,
  });

  return updated;
}

export async function activateInvite(token: string, password?: string) {
  const rel = await prisma.parentStudentRelationship.findFirst({
    where: { status: 'INVITED', inviteToken: token },
    include: { student: true, parent: { include: { user: true } } },
  });

  if (!rel) {
    throw new ApiError(404, 'Invite not found');
  }

  if (rel.inviteExpiresAt && new Date() > rel.inviteExpiresAt) {
    throw new ApiError(
      400,
      'This invite is no longer valid — ask your parent/guardian to resend it',
    );
  }

  const hashedPassword = password ? await hashPassword(password) : undefined;

  await prisma.$transaction(async (tx) => {
    const updatedRel = await tx.parentStudentRelationship.updateMany({
      where: { id: rel.id, status: 'INVITED' },
      data: {
        status: 'ACTIVE',
        activatedAt: new Date(),
      },
    });

    if (updatedRel.count === 0) {
      throw new ApiError(409, 'This invite was already activated or revoked.');
    }

    const isGuardianInvite = rel.relationshipType === 'OPTIONAL_GUARDIAN';
    // An already-registered guardian keeps their own password; only placeholder
    // accounts (created by the invite) get credentials set here.
    const keepExistingCredentials =
      isGuardianInvite && rel.parent.user.passwordHash !== 'placeholder';
    if (!keepExistingCredentials) {
      await tx.user.update({
        where: { id: isGuardianInvite ? rel.parent.userId : rel.student.userId },
        data: {
          passwordHash: hashedPassword || '',
          termsAcceptedAt: new Date(),
        },
      });
    }

    if (!isGuardianInvite) {
      await tx.studentProfile.update({
        where: { id: rel.studentId },
        data: { accountStatus: 'ACTIVE' },
      });
    }
  });

  return {
    accessToken:
      rel.relationshipType === 'OPTIONAL_GUARDIAN'
        ? signAccessToken({ id: rel.parent.userId, role: 'PARENT' })
        : signAccessToken({ id: rel.student.userId, role: 'STUDENT' }),
    studentId: rel.studentId,
    relationshipStatus: 'ACTIVE',
  };
}

/**
 * GET /guardianship/relationships — the caller's own relationships (as parent or as student),
 * optionally filtered by status. Never returns inviteToken.
 */
export async function listMyRelationships(
  callerId: string,
  callerRole: string,
  status?: 'INVITED' | 'ACTIVE' | 'REVOKED',
) {
  let where: Record<string, unknown>;
  if (callerRole === 'PARENT') {
    const parent = await prisma.parentProfile.findUnique({
      where: { userId: callerId },
      select: { id: true },
    });
    if (!parent) return { relationships: [] };
    where = { parentId: parent.id };
  } else {
    const student = await prisma.studentProfile.findUnique({
      where: { userId: callerId },
      select: { id: true },
    });
    if (!student) return { relationships: [] };
    where = { studentId: student.id };
  }
  if (status) where.status = status;

  const relationships = await prisma.parentStudentRelationship.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      parentId: true,
      studentId: true,
      relationshipType: true,
      status: true,
      permissions: true,
      activatedAt: true,
      createdAt: true,
    },
  });
  return { relationships };
}
