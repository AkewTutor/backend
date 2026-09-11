/**
 * tests/services/library.service.test.ts
 *
 * Journey step 4.14. Spec: `09-4-class-delivery-library.md` §9.12.
 * FRs: FR-CD-009, FR-AD-014.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    cohort: { findUnique: vi.fn() },
    cohortMembership: { findFirst: vi.fn() },
    libraryMaterial: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    scheduledSession: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/utils/providers/storage.client.js', () => ({
  upload: vi.fn(),
  getSignedUrl: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import { upload as storageUpload } from '../../src/utils/providers/storage.client.js';
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

describe.skip('uploadMaterial', () => {
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

  it("declared fileType doesn't match the actual file MIME type — throws ApiError(400, 'Unsupported file type')", async () => {
    (prisma.cohort.findUnique as any).mockResolvedValue({ id: COHORT_ID, tutorId: TUTOR_ID });
    // An .exe (MZ header) declared as PDF.
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

    await expect(
      uploadMaterial(TUTOR_ID, COHORT_ID, 'Suspicious', 'PDF', exeBuffer),
    ).rejects.toMatchObject({ statusCode: 400, message: 'Unsupported file type' });
  });
});

describe.skip('listCohortMaterials', () => {
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

describe.skip('adminManageLibrary', () => {
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
});
