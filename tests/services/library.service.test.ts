/**
 * tests/services/library.service.test.ts
 *
 * Journey step 4.14. Spec: `09-4-class-delivery-library.md` Â§9.12.
 * FRs: FR-CD-009, FR-AD-014.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    cohort: { findUnique: vi.fn() },
    cohortMembership: { findFirst: vi.fn() },
    parentStudentRelationship: { findMany: vi.fn() },
    libraryMaterial: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    scheduledSession: { findMany: vi.fn() },
    recordingConsent: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/utils/providers/storage.client.js', () => ({
  upload: vi.fn(),
  getSignedUrl: vi.fn(),
  objectExists: vi.fn().mockResolvedValue(true),
}));

import { prisma } from '../../src/config/db.js';
import {
  upload as storageUpload,
  getSignedUrl as storageGetSignedUrl,
} from '../../src/utils/providers/storage.client.js';
import {
  adminManageLibrary,
  listCohortMaterials,
  uploadMaterial,
} from '../../src/services/library.service.js';

const TUTOR_ID = 'tutor-1';
const COHORT_ID = 'cohort-1';
const MATERIAL_ID = 'material-1';
const ADMIN_ID = 'admin-1';

function resetMocks() {
  vi.clearAllMocks();
  (storageUpload as any).mockResolvedValue({ storageKey: 'library/2026/09/notes.pdf' });
}

describe('uploadMaterial', () => {
  beforeEach(resetMocks);

  it('assigned tutor uploads successfully', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });
    (prisma.libraryMaterial.create as any).mockResolvedValue({
      id: MATERIAL_ID,
      cohortId: COHORT_ID,
      title: 'Chapter 3 Notes',
      fileType: 'PDF',
      fileUrl: 'https://r2.akewtutor.com/library/2026/09/notes.pdf',
    });
    const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');

    const result = await uploadMaterial(TUTOR_ID, COHORT_ID, 'Chapter 3 Notes', 'PDF', pdfBuffer);

    expect(result.title).toBe('Chapter 3 Notes');
  });

  it("non-assigned tutor rejected with ApiError(403, 'Not authorized to upload to this cohort')", async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });

    await expect(
      uploadMaterial('some-other-tutor', COHORT_ID, 'Notes', 'PDF', Buffer.from('x')),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to upload to this cohort',
    });
  });

  it("declared fileType doesn't match the actual file MIME type â€” throws ApiError(400, 'Unsupported file type')", async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });
    // An .exe (MZ header) declared as PDF.
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

    await expect(
      uploadMaterial(TUTOR_ID, COHORT_ID, 'Suspicious', 'PDF', exeBuffer),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('Unsupported file type'),
    });
  });
});

describe('listCohortMaterials', () => {
  beforeEach(resetMocks);

  it('a member retrieves cohort materials', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({
      id: 'membership-1',
      cohortId: COHORT_ID,
    });
    (prisma.libraryMaterial.findMany as any).mockResolvedValue([
      { id: MATERIAL_ID, cohortId: COHORT_ID, title: 'Notes', fileType: 'PDF' },
    ]);

    const result = await listCohortMaterials('student-1', COHORT_ID);

    expect(result).toHaveLength(1);
  });

  it('a non-member rejected (IDOR) with ApiError(403, "Not authorized to view this cohort\'s materials")', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue(null);
    (prisma.cohort.findUnique as any).mockResolvedValue({
      id: COHORT_ID,
      tutorId: 'some-other-tutor',
    });

    await expect(listCohortMaterials('unrelated-student', COHORT_ID)).rejects.toMatchObject({
      statusCode: 403,
      message: "Not authorized to view this cohort's materials",
    });
  });
});

describe('listCohortMaterials â€” Admin and Parent access', () => {
  beforeEach(resetMocks);

  it('Admin reads any cohort without a membership or tutor check', async () => {
    (prisma.libraryMaterial.findMany as any).mockResolvedValue([{ id: MATERIAL_ID }]);

    const result = await listCohortMaterials(ADMIN_ID, COHORT_ID, 'ADMIN');

    expect(result).toHaveLength(1);
    expect(prisma.cohortMembership.findFirst).not.toHaveBeenCalled();
    expect(prisma.cohort.findUnique).not.toHaveBeenCalled();
  });

  it('returns only the contract fields and hides removed materials', async () => {
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({ id: 'm-1' });
    (prisma.libraryMaterial.findMany as any).mockResolvedValue([]);

    await listCohortMaterials('student-1', COHORT_ID, 'STUDENT');

    expect(prisma.libraryMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cohortId: COHORT_ID, removedAt: null },
        select: { id: true, title: true, fileType: true, fileUrl: true, createdAt: true },
      }),
    );
  });

  it("Parent with an ACTIVE child in the cohort retrieves the cohort's materials", async () => {
    (prisma.parentStudentRelationship.findMany as any).mockResolvedValue([
      { studentId: 'student-9' },
    ]);
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({
      id: 'm-1',
      cohortId: COHORT_ID,
    });
    (prisma.libraryMaterial.findMany as any).mockResolvedValue([{ id: MATERIAL_ID }]);

    const result = await listCohortMaterials('parent-profile-1', COHORT_ID, 'PARENT');

    expect(result).toHaveLength(1);
    expect(prisma.parentStudentRelationship.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentId: 'parent-profile-1', status: 'ACTIVE' } }),
    );
    expect(prisma.cohortMembership.findFirst).toHaveBeenCalledWith({
      where: { cohortId: COHORT_ID, studentId: { in: ['student-9'] }, status: 'ACTIVE' },
    });
  });

  it('Parent with no child in the cohort rejected with ApiError(403)', async () => {
    (prisma.parentStudentRelationship.findMany as any).mockResolvedValue([]);
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: 'some-tutor' });

    await expect(
      listCohortMaterials('parent-profile-1', COHORT_ID, 'PARENT'),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Not authorized to view this cohort's materials",
    });
  });
});

describe('adminManageLibrary', () => {
  beforeEach(resetMocks);

  it("admin edits a material's title", async () => {
    (prisma.libraryMaterial.findUnique as any).mockResolvedValue({
      id: MATERIAL_ID,
      title: 'Old title',
    });
    (prisma.libraryMaterial.update as any).mockResolvedValue({
      id: MATERIAL_ID,
      title: 'Updated title',
    });

    const result = await adminManageLibrary(MATERIAL_ID, ADMIN_ID, { title: 'Updated title' });

    expect(result).toEqual({ id: MATERIAL_ID, title: 'Updated title' });
  });

  it('admin removes a material', async () => {
    (prisma.libraryMaterial.findUnique as any).mockResolvedValue({
      id: MATERIAL_ID,
      title: 'Notes',
    });
    (prisma.libraryMaterial.update as any).mockResolvedValue({
      id: MATERIAL_ID,
      removedAt: new Date(),
    });

    await adminManageLibrary(MATERIAL_ID, ADMIN_ID, { remove: true });

    const updateArg = (prisma.libraryMaterial.update as any).mock.calls[0][0];
    expect(updateArg.where).toMatchObject({ id: MATERIAL_ID });
  });

  it("the recording-compliance read reflects recording.service.ts's already-flagged state, performing no independent staleness calculation", async () => {
    (prisma.scheduledSession.findMany as any).mockResolvedValue([
      {
        id: 'session-1',
        cohortId: COHORT_ID,
        tutorId: TUTOR_ID,
        scheduledEnd: new Date(),
        recordingStatus: 'MISSING',
      },
    ]);

    const { adminRecordingCompliance } = await import('../../src/services/library.service.js');
    const result = await adminRecordingCompliance();

    // Every returned row's recordingStatus must come straight from the
    // Prisma read filter (MISSING/ESCALATED), never recomputed here.
    expect(result.every((row: any) => ['MISSING', 'ESCALATED'].includes(row.recordingStatus))).toBe(
      true,
    );
    const findManyArg = (prisma.scheduledSession.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(findManyArg)).toMatch(/MISSING|ESCALATED/);
  });
  it('the recording-compliance queue maps rows to sessionId/cohortId/tutorId for the admin page', async () => {
    (prisma.scheduledSession.findMany as any).mockResolvedValue([
      {
        id: 'session-9',
        cohortId: COHORT_ID,
        scheduledEnd: new Date('2026-10-17T12:00:00Z'),
        recordingStatus: 'ESCALATED',
        cohort: { tutorId: TUTOR_ID },
      },
    ]);

    const { adminRecordingCompliance } = await import('../../src/services/library.service.js');
    const result = await adminRecordingCompliance();

    expect(result[0]).toMatchObject({
      sessionId: 'session-9',
      cohortId: COHORT_ID,
      tutorId: TUTOR_ID,
      recordingStatus: 'ESCALATED',
    });
  });
  it('a completed session whose cohort has an incomplete consent is queued with tutor name and email', async () => {
    (prisma.scheduledSession.findMany as any).mockResolvedValue([
      {
        id: 'session-7',
        cohortId: COHORT_ID,
        scheduledEnd: new Date('2026-10-17T12:00:00Z'),
        recordingStatus: 'UPLOADED',
        cohort: {
          tutorId: TUTOR_ID,
          tutor: { user: { name: 'Tutor Three', email: 't3@example.com' } },
          memberships: [{ studentId: 'student-1' }, { studentId: 'student-2' }],
        },
      },
    ]);
    (prisma.recordingConsent.findMany as any).mockResolvedValue([
      {
        tutorId: TUTOR_ID,
        studentId: 'student-1',
        tutorAcknowledgedAt: new Date(),
        studentOrParentAcknowledgedAt: new Date(),
      },
      {
        tutorId: TUTOR_ID,
        studentId: 'student-2',
        tutorAcknowledgedAt: null,
        studentOrParentAcknowledgedAt: new Date(),
      },
    ]);

    const { adminRecordingCompliance } = await import('../../src/services/library.service.js');
    const result = await adminRecordingCompliance();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sessionId: 'session-7',
      tutorName: 'Tutor Three',
      tutorEmail: 't3@example.com',
      consentIncomplete: true,
      consentMissingCount: 1,
    });
  });

  it('a completed, recorded session with complete consent is not queued', async () => {
    (prisma.scheduledSession.findMany as any).mockResolvedValue([
      {
        id: 'session-8',
        cohortId: COHORT_ID,
        scheduledEnd: new Date('2026-10-17T12:00:00Z'),
        recordingStatus: 'UPLOADED',
        cohort: {
          tutorId: TUTOR_ID,
          tutor: { user: { name: 'Tutor Three', email: 't3@example.com' } },
          memberships: [{ studentId: 'student-1' }],
        },
      },
    ]);
    (prisma.recordingConsent.findMany as any).mockResolvedValue([
      {
        tutorId: TUTOR_ID,
        studentId: 'student-1',
        tutorAcknowledgedAt: new Date(),
        studentOrParentAcknowledgedAt: new Date(),
      },
    ]);

    const { adminRecordingCompliance } = await import('../../src/services/library.service.js');
    const result = await adminRecordingCompliance();

    expect(result).toEqual([]);
  });
});

describe('material file URLs', () => {
  beforeEach(resetMocks);

  it('stores the storage key (not a hardcoded host URL) and a PDF content type when a PDF is uploaded', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });
    (storageUpload as any).mockResolvedValue({ storageKey: 'library/c1/123-PDF' });
    (prisma.libraryMaterial.create as any).mockResolvedValue({ id: MATERIAL_ID });

    await uploadMaterial(TUTOR_ID, COHORT_ID, 'Notes', 'PDF', Buffer.from('%PDF-1.4 x'));

    expect((prisma.libraryMaterial.create as any).mock.calls[0][0].data.fileUrl).toBe(
      'library/c1/123-PDF',
    );
    expect(storageUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      'application/pdf',
    );
  });

  const SAMPLES: Array<[string, Buffer, string, string]> = [
    [
      'PNG',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
      'image/png',
      'NOTE',
    ],
    ['JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'image/jpeg', 'NOTE'],
    ['WEBP', Buffer.from('RIFF0000WEBPVP8 ', 'latin1'), 'image/webp', 'NOTE'],
    [
      'DOC',
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]),
      'application/msword',
      'NOTE',
    ],
    [
      'DOCX',
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('xx word/document.xml')]),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'NOTE',
    ],
    ['PDF', Buffer.from('%PDF-1.4 x'), 'application/pdf', 'PDF'],
  ];

  it.each(SAMPLES)(
    'accepts and classifies %s by content',
    async (_n, buf, contentType, fileType) => {
      (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });
      (storageUpload as any).mockResolvedValue({ storageKey: 'library/c1/k' });
      (prisma.libraryMaterial.create as any).mockResolvedValue({ id: MATERIAL_ID });

      await uploadMaterial(TUTOR_ID, COHORT_ID, 'Item', undefined, buf);

      expect(storageUpload).toHaveBeenCalledWith(expect.any(String), buf, contentType);
      expect((prisma.libraryMaterial.create as any).mock.calls[0][0].data.fileType).toBe(fileType);
    },
  );

  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42')]);
  const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  ')]);
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]);

  it.each([
    ['MP4', mp4, 'video/mp4'],
    ['MOV', mov, 'video/quicktime'],
    ['WEBM', webm, 'video/webm'],
  ])('accepts %s by content and stores it as VIDEO', async (_n, buf, contentType) => {
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });
    (storageUpload as any).mockResolvedValue({ storageKey: 'library/c1/v' });
    (prisma.libraryMaterial.create as any).mockResolvedValue({ id: MATERIAL_ID });

    await uploadMaterial(TUTOR_ID, COHORT_ID, 'Lesson', undefined, buf);

    expect(storageUpload).toHaveBeenCalledWith(expect.any(String), buf, contentType);
    expect((prisma.libraryMaterial.create as any).mock.calls[0][0].data.fileType).toBe('VIDEO');
  });

  it('rejects a document over 10 MB with 413 but accepts a video over 10 MB', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });
    (storageUpload as any).mockResolvedValue({ storageKey: 'library/c1/big' });
    (prisma.libraryMaterial.create as any).mockResolvedValue({ id: MATERIAL_ID });
    const bigPdf = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(10 * 1024 * 1024)]);
    const bigMp4 = Buffer.concat([mp4, Buffer.alloc(10 * 1024 * 1024)]);

    await expect(
      uploadMaterial(TUTOR_ID, COHORT_ID, 'Big', undefined, bigPdf),
    ).rejects.toMatchObject({
      statusCode: 413,
    });
    await expect(
      uploadMaterial(TUTOR_ID, COHORT_ID, 'Big video', undefined, bigMp4),
    ).resolves.toBeDefined();
  });

  it('rejects an exe and a plain text file without storing anything', async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });
    for (const buf of [Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from('just some text')]) {
      await expect(
        uploadMaterial(TUTOR_ID, COHORT_ID, 'Bad', undefined, buf),
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    }
    expect(storageUpload).not.toHaveBeenCalled();
    expect(prisma.libraryMaterial.create).not.toHaveBeenCalled();
  });

  it('returns signed download URLs, resolving legacy r2.akewtutor.com URLs to their storage key', async () => {
    (prisma.libraryMaterial.findMany as any).mockResolvedValue([
      {
        id: MATERIAL_ID,
        title: 'Old',
        fileType: 'PDF',
        fileUrl: 'https://r2.akewtutor.com/library/c1/1-PDF',
      },
      { id: 'material-2', title: 'New', fileType: 'PDF', fileUrl: 'library/c1/2-PDF' },
    ]);
    (storageGetSignedUrl as any).mockImplementation(async (key: string) => 'https://signed/' + key);

    const result = await listCohortMaterials(ADMIN_ID, COHORT_ID, 'ADMIN');

    expect(result[0].fileUrl).toBe('https://signed/library/c1/1-PDF');
    expect(result[1].fileUrl).toBe('https://signed/library/c1/2-PDF');
  });
});

describe('removeMaterial', () => {
  beforeEach(resetMocks);

  it('assigned tutor soft-removes the material', async () => {
    const { removeMaterial } = await import('../../src/services/library.service.js');
    (prisma.libraryMaterial.findUnique as any).mockResolvedValue({
      id: MATERIAL_ID,
      cohortId: COHORT_ID,
      removedAt: null,
    });
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });
    (prisma.libraryMaterial.update as any).mockResolvedValue({});

    await expect(removeMaterial(TUTOR_ID, MATERIAL_ID)).resolves.toEqual({
      id: MATERIAL_ID,
      removed: true,
    });
    expect(prisma.libraryMaterial.update).toHaveBeenCalledWith({
      where: { id: MATERIAL_ID },
      data: { removedAt: expect.any(Date) },
    });
  });

  it('a different tutor is rejected with 403', async () => {
    const { removeMaterial } = await import('../../src/services/library.service.js');
    (prisma.libraryMaterial.findUnique as any).mockResolvedValue({
      id: MATERIAL_ID,
      cohortId: COHORT_ID,
      removedAt: null,
    });
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: 'other-tutor' });

    await expect(removeMaterial(TUTOR_ID, MATERIAL_ID)).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.libraryMaterial.update).not.toHaveBeenCalled();
  });

  it('missing or already removed material is 404', async () => {
    const { removeMaterial } = await import('../../src/services/library.service.js');
    (prisma.libraryMaterial.findUnique as any).mockResolvedValue({
      id: MATERIAL_ID,
      cohortId: COHORT_ID,
      removedAt: new Date(),
    });

    await expect(removeMaterial(TUTOR_ID, MATERIAL_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('listCohortMaterials visibility', () => {
  beforeEach(resetMocks);

  it('ADMIN sees removed materials (removedAt included) and no storage check runs', async () => {
    const client = await import('../../src/utils/providers/storage.client.js');
    (prisma.libraryMaterial.findMany as any).mockResolvedValue([
      {
        id: MATERIAL_ID,
        title: 'Gone',
        fileType: 'PDF',
        fileUrl: 'library/c1/gone.pdf',
        removedAt: new Date('2026-10-01'),
      },
    ]);
    (storageGetSignedUrl as any).mockImplementation(async (k: string) => 'https://signed/' + k);

    const result = await listCohortMaterials(ADMIN_ID, COHORT_ID, 'ADMIN');

    expect(prisma.libraryMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cohortId: COHORT_ID } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].removedAt).toBeTruthy();
    expect(client.objectExists).not.toHaveBeenCalled();
  });

  it('student: removed rows are excluded and files missing from storage are hidden and soft-removed', async () => {
    const client = await import('../../src/utils/providers/storage.client.js');
    (prisma.cohortMembership.findFirst as any).mockResolvedValue({ id: 'mem-1' });
    (prisma.libraryMaterial.findMany as any).mockResolvedValue([
      { id: 'm-ok', title: 'Ok', fileType: 'PDF', fileUrl: 'library/c1/ok.pdf', removedAt: null },
      {
        id: 'm-gone',
        title: 'Gone',
        fileType: 'PDF',
        fileUrl: 'library/c1/gone.pdf',
        removedAt: null,
      },
    ]);
    (client.objectExists as any).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    (storageGetSignedUrl as any).mockImplementation(async (k: string) => 'https://signed/' + k);

    const result = await listCohortMaterials('student-1', COHORT_ID, 'STUDENT');

    expect(prisma.libraryMaterial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cohortId: COHORT_ID, removedAt: null } }),
    );
    expect(result.map((m: { id: string }) => m.id)).toEqual(['m-ok']);
    expect(prisma.libraryMaterial.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['m-gone'] } },
      data: { removedAt: expect.any(Date) },
    });
  });
});
