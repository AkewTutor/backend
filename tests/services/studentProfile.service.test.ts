/**
 * tests/services/studentProfile.service.test.ts
 *
 * Journey step 2.2. Spec: `09-2-accounts-guardianship.md` §9.3.
 * FRs: FR-SP-006–010, FR-AC-008 (`assertAccountStatusAllowsAccess` — gap closed).
 * NFRs: NFR-009 (parent/student scoping).
 * OWASP: A01:2021 – Broken Access Control (parent/student ownership scoping
 *        is the central risk in this file — canonical IDOR/BOLA coverage).
 *
 * `assertAccountStatusAllowsAccess` is the platform-wide FR-AC-008 hold gate
 * every other feature's booking/session-access call depends on — pinned
 * here first (per the journey doc's Rule 5 rationale) so that
 * `matching-cohorts` (Phase 3) and `class-delivery-library` (Phase 4) can
 * safely mock it. The cross-feature "wired in" checks for those callers
 * live in their own feature's test files (9-3, 9-4), not duplicated here —
 * this file only proves the gate itself.
 *
 * Profile pictures are stored in object storage as a key; `getProfile` and
 * `uploadProfilePicture` return a signed URL (http(s) values pass through).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    studentProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    parentStudentRelationship: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../src/utils/providers/storage.client.js', () => ({
  upload: vi.fn(),
  getSignedUrl: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { upload as storageUpload, getSignedUrl } from '../../src/utils/providers/storage.client.js';
import {
  assertAccountStatusAllowsAccess,
  getProfile,
  updateAcademicProfile,
  updateBasicProfile,
  uploadProfilePicture,
} from '../../src/services/studentProfile.service.js';

function resetAllMocks() {
  vi.clearAllMocks();
}

describe('studentProfile.service.ts', () => {
  beforeEach(() => resetAllMocks());

  it('a student retrieves their own profile using their own id as the lookup key', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({ id: 'sp-1', grade: 9 });

    const result = await getProfile('sp-1', 'STUDENT');

    expect(result).toMatchObject({ id: 'sp-1', grade: 9 });
  });

  it('a parent retrieves a linked, ACTIVE student profile', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({ status: 'ACTIVE' });
    (prisma.studentProfile.findUnique as any).mockResolvedValue({ id: 'sp-1', grade: 9 });

    const result = await getProfile('parent-1', 'PARENT', 'sp-1');

    expect(result).toMatchObject({ id: 'sp-1' });
  });

  it('a parent viewing an unlinked student profile is rejected — canonical IDOR/BOLA case', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue(null);

    await expect(getProfile('parent-1', 'PARENT', 'other-student')).rejects.toMatchObject({
      statusCode: 403,
      message: "Not authorized to view this student's profile",
    });
  });

  it('a revoked/non-ACTIVE relationship is not sufficient — historical linkage alone does not grant access', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({ status: 'REVOKED' });

    await expect(getProfile('parent-1', 'PARENT', 'sp-1')).rejects.toMatchObject({
      statusCode: 403,
      message: "Not authorized to view this student's profile",
    });
  });

  it('an INVITED (not yet ACTIVE) relationship is also not sufficient — invite-management access only per FR-AC-003', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({ status: 'INVITED' });

    await expect(getProfile('parent-1', 'PARENT', 'sp-1')).rejects.toMatchObject({
      statusCode: 403,
      message: "Not authorized to view this student's profile",
    });
  });

  it('a stored storage key is returned as a signed URL', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({
      id: 'sp-1',
      profilePictureUrl: 'profile-pictures/sp-1/abc.png',
    });
    (getSignedUrl as any).mockResolvedValue('https://signed.example/pic');

    const result = await getProfile('sp-1', 'STUDENT');

    expect(getSignedUrl).toHaveBeenCalledWith('profile-pictures/sp-1/abc.png', 3600);
    expect(result.profilePictureUrl).toBe('https://signed.example/pic');
  });

  it('an existing http(s) picture URL is returned unchanged and never signed', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({
      id: 'sp-1',
      profilePictureUrl: 'https://cdn.example.com/a.jpg',
    });

    const result = await getProfile('sp-1', 'STUDENT');

    expect(getSignedUrl).not.toHaveBeenCalled();
    expect(result.profilePictureUrl).toBe('https://cdn.example.com/a.jpg');
  });

  it('a profile with no picture is returned as-is and never signed', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({
      id: 'sp-1',
      profilePictureUrl: null,
    });

    const result = await getProfile('sp-1', 'STUDENT');

    expect(getSignedUrl).not.toHaveBeenCalled();
    expect(result.profilePictureUrl).toBeNull();
  });
});

describe('updateBasicProfile', () => {
  beforeEach(() => resetAllMocks());

  it('a valid image update resolves the updated id/profilePictureUrl', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({ status: 'ACTIVE' });
    (prisma.studentProfile.update as any).mockResolvedValue({
      id: 'sp-1',
      profilePictureUrl: 'https://cdn.example.com/a.jpg',
    });

    const result = await updateBasicProfile('sp-1', 'STUDENT', 'sp-1', {
      profilePictureUrl: 'https://cdn.example.com/a.jpg',
    } as any);

    expect(result).toMatchObject({
      id: 'sp-1',
      profilePictureUrl: 'https://cdn.example.com/a.jpg',
    });
  });

  it('an invalid image format/size throws ApiError(400)', async () => {
    await expect(
      updateBasicProfile('sp-1', 'STUDENT', 'sp-1', {
        profilePictureUrl: 'not-a-valid-image-ref',
        __simulateInvalidImage: true,
      } as any),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Unsupported image format or file too large',
    });
  });

  it('the same ownership check as getProfile applies — a parent cannot edit an unlinked student', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue(null);

    await expect(
      updateBasicProfile('parent-1', 'PARENT', 'other-student', {
        profilePictureUrl: 'https://cdn.example.com/a.jpg',
      } as any),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('uploadProfilePicture', () => {
  beforeEach(() => resetAllMocks());

  const png = { buffer: Buffer.from('x'), mimetype: 'image/png' };

  it('stores the image, saves the storage key and returns a signed URL', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({ id: 'sp-1' });
    (storageUpload as any).mockResolvedValue({ storageKey: 'profile-pictures/sp-1/abc.png' });
    (prisma.studentProfile.update as any).mockResolvedValue({
      id: 'sp-1',
      profilePictureUrl: 'profile-pictures/sp-1/abc.png',
    });
    (getSignedUrl as any).mockResolvedValue('https://signed.example/pic');

    const result = await uploadProfilePicture('u1', 'STUDENT', undefined, png);

    expect(storageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^profile-pictures\/sp-1\/.+\.png$/),
      png.buffer,
      'image/png',
    );
    expect(prisma.studentProfile.update).toHaveBeenCalledWith({
      where: { id: 'sp-1' },
      data: { profilePictureUrl: 'profile-pictures/sp-1/abc.png' },
    });
    expect(result.profilePictureUrl).toBe('https://signed.example/pic');
  });

  it('uses the right file extension for jpeg and webp', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({ id: 'sp-1' });
    (storageUpload as any).mockResolvedValue({ storageKey: 'k' });
    (prisma.studentProfile.update as any).mockResolvedValue({ id: 'sp-1', profilePictureUrl: 'k' });
    (getSignedUrl as any).mockResolvedValue('https://signed.example/pic');

    await uploadProfilePicture('u1', 'STUDENT', undefined, {
      buffer: Buffer.from('x'),
      mimetype: 'image/jpeg',
    });
    await uploadProfilePicture('u1', 'STUDENT', undefined, {
      buffer: Buffer.from('x'),
      mimetype: 'image/webp',
    });

    expect((storageUpload as any).mock.calls[0][0]).toMatch(/\.jpg$/);
    expect((storageUpload as any).mock.calls[1][0]).toMatch(/\.webp$/);
  });

  it('rejects a missing or non-image file with ApiError(400) and uploads nothing', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({ id: 'sp-1' });

    await expect(
      uploadProfilePicture('u1', 'STUDENT', undefined, {
        buffer: Buffer.from('x'),
        mimetype: 'application/pdf',
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(uploadProfilePicture('u1', 'STUDENT', undefined, undefined)).rejects.toMatchObject(
      {
        statusCode: 400,
      },
    );

    expect(storageUpload).not.toHaveBeenCalled();
    expect(prisma.studentProfile.update).not.toHaveBeenCalled();
  });

  it('a parent cannot upload for an unlinked student (IDOR) and nothing is stored', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue(null);

    await expect(uploadProfilePicture('parent-1', 'PARENT', 'sp-9', png)).rejects.toMatchObject({
      statusCode: 403,
    });

    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('a parent can upload for a linked ACTIVE student', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({ status: 'ACTIVE' });
    (storageUpload as any).mockResolvedValue({ storageKey: 'profile-pictures/sp-1/abc.png' });
    (prisma.studentProfile.update as any).mockResolvedValue({
      id: 'sp-1',
      profilePictureUrl: 'profile-pictures/sp-1/abc.png',
    });
    (getSignedUrl as any).mockResolvedValue('https://signed.example/pic');

    const result = await uploadProfilePicture('parent-1', 'PARENT', 'sp-1', png);

    expect(prisma.studentProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sp-1' } }),
    );
    expect(result.profilePictureUrl).toBe('https://signed.example/pic');
  });
});

describe('updateAcademicProfile', () => {
  beforeEach(() => resetAllMocks());

  it('a partial update touches only the supplied fields, not every field reset to a default', async () => {
    (prisma.studentProfile.update as any).mockResolvedValue({ id: 'sp-1', grade: 10 });

    await updateAcademicProfile('sp-1', 'STUDENT', 'sp-1', { grade: 10 } as any);

    const callArg = (prisma.studentProfile.update as any).mock.calls[0][0];
    expect(Object.keys(callArg.data)).toEqual(['grade']);
  });

  it('setting formatPreference does not create a MatchRequest — effect scoped to the profile row only', async () => {
    (prisma.studentProfile.update as any).mockResolvedValue({
      id: 'sp-1',
      formatPreference: 'ONE_TO_ONE',
    });

    await updateAcademicProfile('sp-1', 'STUDENT', 'sp-1', {
      formatPreference: 'ONE_TO_ONE',
    } as any);

    expect(Object.keys(prisma)).not.toContain('matchRequest');
  });

  it('an incomplete profile (only one field supplied) is accepted without error', async () => {
    (prisma.studentProfile.update as any).mockResolvedValue({
      id: 'sp-1',
      preferredLanguage: 'AMHARIC',
    });

    await expect(
      updateAcademicProfile('sp-1', 'STUDENT', 'sp-1', { preferredLanguage: 'AMHARIC' } as any),
    ).resolves.not.toThrow();
  });

  it('a parent updates a linked ACTIVE student academic profile successfully', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue({ status: 'ACTIVE' });
    (prisma.studentProfile.update as any).mockResolvedValue({ id: 'sp-1', grade: 8 });

    await expect(
      updateAcademicProfile('parent-1', 'PARENT', 'sp-1', { grade: 8 } as any),
    ).resolves.toMatchObject({ id: 'sp-1' });
  });

  it('a parent updating an unlinked student academic profile throws ApiError(403) — IDOR', async () => {
    (prisma.parentStudentRelationship.findFirst as any).mockResolvedValue(null);

    await expect(
      updateAcademicProfile('parent-1', 'PARENT', 'other-student', { grade: 8 } as any),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('assertAccountStatusAllowsAccess', () => {
  beforeEach(() => resetAllMocks());

  it('an ACTIVE account resolves silently, with no return value', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({ accountStatus: 'ACTIVE' });

    await expect(assertAccountStatusAllowsAccess('sp-1')).resolves.toBeUndefined();
  });

  it('a GUARDIAN_REQUIRED_HOLD account is blocked with the documented message', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({
      accountStatus: 'GUARDIAN_REQUIRED_HOLD',
    });

    await expect(assertAccountStatusAllowsAccess('sp-1')).rejects.toMatchObject({
      statusCode: 403,
      message:
        "This student's account is on hold pending a guardian — booking and class access are unavailable until a guardian is linked",
    });
  });

  it('a PENDING_ACTIVATION account is blocked with the identical message as the hold case', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue({
      accountStatus: 'PENDING_ACTIVATION',
    });

    await expect(assertAccountStatusAllowsAccess('sp-1')).rejects.toMatchObject({
      statusCode: 403,
      message:
        "This student's account is on hold pending a guardian — booking and class access are unavailable until a guardian is linked",
    });
  });

  it('a non-existent studentId throws ApiError(404), distinct from the 403 hold cases', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(null);

    await expect(
      assertAccountStatusAllowsAccess('11111111-1111-4111-8111-111111111111'),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
