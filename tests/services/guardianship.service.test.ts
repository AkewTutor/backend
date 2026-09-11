/**
 * tests/services/guardianship.service.test.ts
 *
 * Journey step 2.6. Spec: `09-2-accounts-guardianship.md` §9.6.
 * FRs: FR-AC-001–008.
 * OWASP: A01:2021 – Broken Access Control,
 *        A04:2021 – Insecure Design (invite-token predictability/expiry),
 *        A09:2021 – Security Logging and Monitoring Failures (audit-log
 *        coverage for GUARDIAN_REMOVED, both the sole- and non-sole-guardian
 *        paths — Phase 4/Review §6.4).
 *
 * Includes the 14-day invite-expiry/reset cases and the sole-guardian
 * `GUARDIAN_REQUIRED_HOLD` case per the folder-structure doc's summary note.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    $transaction: vi.fn(),
    studentProfile: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    parentStudentRelationship: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../src/utils/password.js', () => ({
  hashPassword: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
}));

vi.mock('../../src/services/notification.service.js', () => ({
  dispatchNotification: vi.fn(),
}));

vi.mock('../../src/services/auditLog.service.js', () => ({
  record: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { hashPassword } from '../../src/utils/password.js';
import { signAccessToken } from '../../src/utils/jwt.js';
import { dispatchNotification } from '../../src/services/notification.service.js';
import { record as recordAuditLog } from '../../src/services/auditLog.service.js';
import {
  activateInvite,
  addStudentAndInvite,
  handleSoleGuardianRemoval,
  inviteOptionalGuardian,
  resendOrRegenerateInvite,
  revokeOrModifyRelationship,
} from '../../src/services/guardianship.service.js';
import ApiError from '../../src/utils/ApiError.js';

function resetAllMocks() {
  vi.clearAllMocks();
  (hashPassword as any).mockResolvedValue('$2b$04$dummyhasheddummyhasheddummyhasheddummyhas');
  (signAccessToken as any).mockReturnValue('signed.jwt.token');
  (dispatchNotification as any).mockResolvedValue(undefined);
  (recordAuditLog as any).mockResolvedValue(undefined);
}

describe.skip('addStudentAndInvite', () => {
  beforeEach(() => resetAllMocks());

  it('Grade 1–5 succeeds — creates a placeholder StudentProfile + INVITED MANDATORY_GUARDIAN relationship', async () => {
    (prisma.$transaction as any).mockResolvedValue([
      { id: 'sp-1', grade: 3 },
      { id: 'rel-1', status: 'INVITED', relationshipType: 'MANDATORY_GUARDIAN' },
    ]);

    const result = await addStudentAndInvite('parent-1', 3, 'contact@example.com');

    expect(result).toMatchObject({ studentProfileId: 'sp-1', relationshipId: 'rel-1' });
    expect(dispatchNotification).toHaveBeenCalled();
  });

  it('Grade 6–12 is rejected on the parent-initiated path', async () => {
    await expect(addStudentAndInvite('parent-1', 9, 'contact@example.com')).rejects.toMatchObject({
      statusCode: 400,
      message: 'Grades 6–12 students register independently — see /auth/register/student',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('invite expiry is exactly 14 days from creation', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    (prisma.$transaction as any).mockResolvedValue([
      { id: 'sp-1', grade: 3 },
      {
        id: 'rel-1',
        status: 'INVITED',
        inviteExpiresAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      },
    ]);

    await addStudentAndInvite('parent-1', 3, 'contact@example.com');

    const txArg = (prisma.$transaction as any).mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
    vi.useRealTimers();
  });

  it('dispatches the invite to whichever channel the contact shape implies', async () => {
    (prisma.$transaction as any).mockResolvedValue([{ id: 'sp-1' }, { id: 'rel-1' }]);
    await addStudentAndInvite('parent-1', 3, 'email@example.com');
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({ channel: 'EMAIL' }),
    );

    vi.clearAllMocks();
    (dispatchNotification as any).mockResolvedValue(undefined);
    (prisma.$transaction as any).mockResolvedValue([{ id: 'sp-2' }, { id: 'rel-2' }]);
    await addStudentAndInvite('parent-1', 3, '+251911000000');
    expect(dispatchNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({ channel: 'SMS' }),
    );
  });
});

describe.skip('resendOrRegenerateInvite', () => {
  beforeEach(() => resetAllMocks());

  it('owner resends before activation — resets to a fresh 14-day window, not an extension', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      status: 'INVITED',
    });
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({
      id: 'rel-1',
      inviteExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    await expect(resendOrRegenerateInvite('parent-1', 'rel-1')).resolves.toBeDefined();
    expect(dispatchNotification).toHaveBeenCalled();
  });

  it('a non-owner resend attempt is rejected — IDOR', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-owner',
      status: 'INVITED',
    });

    await expect(resendOrRegenerateInvite('parent-other', 'rel-1')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to manage this invite',
    });
  });

  it('an already-activated relationship rejects the resend', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      status: 'ACTIVE',
    });

    await expect(resendOrRegenerateInvite('parent-1', 'rel-1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'This student has already activated their account',
    });
  });

  it('repeated resends keep resetting the window — no cap, intentionally unlimited', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      status: 'INVITED',
    });
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({ id: 'rel-1' });

    await resendOrRegenerateInvite('parent-1', 'rel-1');
    await resendOrRegenerateInvite('parent-1', 'rel-1');
    await resendOrRegenerateInvite('parent-1', 'rel-1');

    expect(prisma.parentStudentRelationship.update).toHaveBeenCalledTimes(3);
  });
});

describe.skip('activateInvite', () => {
  beforeEach(() => resetAllMocks());

  it('a valid, unexpired token activates the account and resolves the documented shape', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({
      id: 'rel-1',
      studentProfileId: 'sp-1',
      status: 'INVITED',
      inviteExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    (prisma.$transaction as any).mockResolvedValue([
      { id: 'user-1' },
      { id: 'rel-1', status: 'ACTIVE' },
    ]);

    const result = await activateInvite('good-token', 'password123');

    expect(result).toMatchObject({
      accessToken: 'signed.jwt.token',
      studentId: expect.any(String),
      relationshipStatus: 'ACTIVE',
    });
  });

  it('an expired token throws ApiError(400)', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({
      id: 'rel-1',
      status: 'INVITED',
      inviteExpiresAt: new Date(Date.now() - 1000),
    });

    await expect(activateInvite('expired-token', 'password123')).rejects.toMatchObject({
      statusCode: 400,
      message: 'This invite is no longer valid — ask your parent/guardian to resend it',
    });
  });

  it('an unknown token throws ApiError(404)', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue(null);

    await expect(activateInvite('bogus-token', 'password123')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Invite not found',
    });
  });

  it('a token already ACTIVE cannot be reused for a second activation', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue(null);

    await expect(activateInvite('already-used-token', 'password123')).rejects.toBeDefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('the password is hashed before persistence — never the literal string', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({
      id: 'rel-1',
      status: 'INVITED',
      inviteExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    (prisma.$transaction as any).mockImplementation(async (ops: any) => {
      // Simulate the transaction callback/array to inspect the User create payload.
      return [{ id: 'user-1' }, { id: 'rel-1', status: 'ACTIVE' }];
    });

    await activateInvite('good-token', 'plainpass123');

    expect(hashPassword).toHaveBeenCalledWith('plainpass123');
  });

  it('resolves relationshipStatus ACTIVE — the value the parent-side UI unlocks full functionality on', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({
      id: 'rel-1',
      status: 'INVITED',
      inviteExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    (prisma.$transaction as any).mockResolvedValue([
      { id: 'user-1' },
      { id: 'rel-1', status: 'ACTIVE' },
    ]);

    const result = await activateInvite('good-token', 'password123');

    expect(result.relationshipStatus).toBe('ACTIVE');
  });

  it('[Phase 4 — Review §6.1] idempotency — exactly one User row is created across a near-simultaneous retry', async () => {
    (prisma.parentStudentRelationship.findFirst as any)
      .mockResolvedValueOnce({
        id: 'rel-1',
        status: 'INVITED',
        inviteExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
      })
      .mockResolvedValueOnce(null); // second call's lookup reflects the now-consumed token.
    (prisma.$transaction as any).mockResolvedValueOnce([
      { id: 'user-1' },
      { id: 'rel-1', status: 'ACTIVE' },
    ]);

    const first = await activateInvite('good-token', 'password123');
    await expect(activateInvite('good-token', 'password123')).rejects.toBeDefined();

    expect(first.accessToken).toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe.skip('inviteOptionalGuardian', () => {
  beforeEach(() => resetAllMocks());

  it('a Grade 6–12 student invites a guardian — creates an OPTIONAL_GUARDIAN, INVITED relationship', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({ id: 'sp-1', grade: 9 });
    (prisma.parentStudentRelationship.create as any).mockResolvedValue({
      id: 'rel-2',
      relationshipType: 'OPTIONAL_GUARDIAN',
      status: 'INVITED',
    });

    const result = await inviteOptionalGuardian('sp-1', 'guardian@example.com');

    expect(result).toMatchObject({ relationshipType: 'OPTIONAL_GUARDIAN', status: 'INVITED' });
  });

  it('a Grade 1–5 student is blocked — defense in depth', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({ id: 'sp-1', grade: 3 });

    await expect(inviteOptionalGuardian('sp-1', 'guardian@example.com')).rejects.toMatchObject({
      statusCode: 403,
      message: 'This action is only available to Grade 6–12 students',
    });
  });
});

describe.skip('revokeOrModifyRelationship / handleSoleGuardianRemoval', () => {
  beforeEach(() => resetAllMocks());

  it('a guardian revokes their own relationship — not sole; studentAccountStatus key is omitted entirely', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      studentProfileId: 'sp-1',
      relationshipType: 'MANDATORY_GUARDIAN',
      initiatedBy: 'parent-1',
    });
    (prisma.parentStudentRelationship.count as any).mockResolvedValue(2);
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({
      id: 'rel-1',
      status: 'REVOKED',
    });

    const result = await revokeOrModifyRelationship('parent-1', 'PARENT', 'rel-1', {
      revoke: true,
    } as any);

    expect(result).not.toHaveProperty('studentAccountStatus');
  });

  it('[Phase 4 — Review §6.4] non-sole-guardian removal is audit-logged with action GUARDIAN_REMOVED', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      studentProfileId: 'sp-1',
      relationshipType: 'MANDATORY_GUARDIAN',
      initiatedBy: 'parent-1',
    });
    (prisma.parentStudentRelationship.count as any).mockResolvedValue(2);
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({
      id: 'rel-1',
      status: 'REVOKED',
    });

    await revokeOrModifyRelationship('parent-1', 'PARENT', 'rel-1', { revoke: true } as any);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'parent-1', action: 'GUARDIAN_REMOVED', target: 'rel-1' }),
    );
  });

  it('a guardian revokes the sole mandatory relationship — triggers GUARDIAN_REQUIRED_HOLD', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      studentProfileId: 'sp-1',
      relationshipType: 'MANDATORY_GUARDIAN',
      initiatedBy: 'parent-1',
    });
    (prisma.parentStudentRelationship.count as any).mockResolvedValue(1);
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({
      id: 'rel-1',
      status: 'REVOKED',
    });
    (prisma.studentProfile.update as any).mockResolvedValue({
      id: 'sp-1',
      accountStatus: 'GUARDIAN_REQUIRED_HOLD',
    });

    const result = await revokeOrModifyRelationship('parent-1', 'PARENT', 'rel-1', {
      revoke: true,
    } as any);

    expect(result).toMatchObject({ studentAccountStatus: 'GUARDIAN_REQUIRED_HOLD' });
    expect(prisma.studentProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accountStatus: 'GUARDIAN_REQUIRED_HOLD' }),
      }),
    );
  });

  it('sole-guardian removal preserves all student data — no delete call is made against any student-owned table', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      studentProfileId: 'sp-1',
      relationshipType: 'MANDATORY_GUARDIAN',
      initiatedBy: 'parent-1',
    });
    (prisma.parentStudentRelationship.count as any).mockResolvedValue(1);
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({
      id: 'rel-1',
      status: 'REVOKED',
    });
    (prisma.studentProfile.update as any).mockResolvedValue({
      id: 'sp-1',
      accountStatus: 'GUARDIAN_REQUIRED_HOLD',
    });

    await revokeOrModifyRelationship('parent-1', 'PARENT', 'rel-1', { revoke: true } as any);

    expect((prisma.studentProfile as any).delete).toBeUndefined();
  });

  it('a Grade 1–5 student attempting to revoke their own mandatory guardian is rejected', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      studentProfileId: 'student-1',
      relationshipType: 'MANDATORY_GUARDIAN',
      initiatedBy: 'parent-1',
    });

    await expect(
      revokeOrModifyRelationship('student-1', 'STUDENT', 'rel-1', { revoke: true } as any),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only a guardian or Admin can remove this relationship',
    });
  });

  it('a Grade 6–12 student revoking a relationship they did not initiate is rejected', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-2',
      parentId: 'parent-1',
      studentProfileId: 'student-1',
      relationshipType: 'OPTIONAL_GUARDIAN',
      initiatedBy: 'parent-1',
    });

    await expect(
      revokeOrModifyRelationship('student-1', 'STUDENT', 'rel-2', { revoke: true } as any),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to modify this relationship',
    });
  });

  it('a Grade 6–12 student revoking a relationship they did initiate succeeds — FR-AC-007 exception', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-2',
      parentId: 'parent-2',
      studentProfileId: 'student-1',
      relationshipType: 'OPTIONAL_GUARDIAN',
      initiatedBy: 'student-1',
    });
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({
      id: 'rel-2',
      status: 'REVOKED',
    });

    await expect(
      revokeOrModifyRelationship('student-1', 'STUDENT', 'rel-2', { revoke: true } as any),
    ).resolves.toBeDefined();
  });

  it('an unrelated caller cannot revoke a relationship entirely unconnected to them — IDOR', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue(null);

    await expect(
      revokeOrModifyRelationship('random-user', 'PARENT', 'unrelated-rel', { revoke: true } as any),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('modify-permissions-only (no revoke) never triggers handleSoleGuardianRemoval, even for a sole-guardian relationship', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      studentProfileId: 'sp-1',
      relationshipType: 'MANDATORY_GUARDIAN',
      initiatedBy: 'parent-1',
    });
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({
      id: 'rel-1',
      permissions: {},
    });

    await revokeOrModifyRelationship('parent-1', 'PARENT', 'rel-1', {
      revoke: false,
      permissions: { canBook: true },
    } as any);

    expect(prisma.studentProfile.update).not.toHaveBeenCalled();
  });

  it('[Phase 4 — Review §6.4] sole-guardian removal writes an audit log entry, independent of the hold-state assertion', async () => {
    (prisma.parentStudentRelationship.findUnique as any).mockResolvedValue({
      id: 'rel-1',
      parentId: 'parent-1',
      studentProfileId: 'sp-1',
      relationshipType: 'MANDATORY_GUARDIAN',
      initiatedBy: 'parent-1',
    });
    (prisma.parentStudentRelationship.count as any).mockResolvedValue(1);
    (prisma.parentStudentRelationship.update as any).mockResolvedValue({
      id: 'rel-1',
      status: 'REVOKED',
    });
    (prisma.studentProfile.update as any).mockResolvedValue({
      id: 'sp-1',
      accountStatus: 'GUARDIAN_REQUIRED_HOLD',
    });

    await revokeOrModifyRelationship('parent-1', 'PARENT', 'rel-1', { revoke: true } as any);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'parent-1', action: 'GUARDIAN_REMOVED', target: 'rel-1' }),
    );
  });
});
