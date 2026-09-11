/**
 * tests/services/badge.service.test.ts
 *
 * Journey step 6.5. Spec: `09-6-gamification-engagement.md` §9.4.
 * FRs: FR-GA-003, FR-GA-005, FR-AD-004, FR-AD-018.
 * OWASP: A01:2021 – Broken Access Control. A04:2021 – Insecure Design
 * (no-rating-derived field is a structural design safety control per FC-01).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    badge: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    studentBadge: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    tutorBadge: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import {
  awardStudentBadge,
  awardTutorBadge,
  createBadge,
  adminManageBadges,
} from '../../src/services/badge.service.js';

const STUDENT_ID = 'student-1';
const TUTOR_ID = 'tutor-1';
const BADGE_ID = 'badge-1';

describe.skip('awardStudentBadge / awardTutorBadge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('awards a student badge', async () => {
    (prisma.studentBadge.findUnique as any).mockResolvedValue(null);
    (prisma.studentBadge.create as any).mockResolvedValue({
      id: 'sb-1',
      studentId: STUDENT_ID,
      badgeId: BADGE_ID,
      earnedAt: new Date(),
    });

    const result = await awardStudentBadge(STUDENT_ID, BADGE_ID);

    expect(result.studentId).toBe(STUDENT_ID);
    expect(prisma.studentBadge.create).toHaveBeenCalled();
  });

  it('awards a tutor badge', async () => {
    (prisma.tutorBadge.findUnique as any).mockResolvedValue(null);
    (prisma.tutorBadge.create as any).mockResolvedValue({
      id: 'tb-1',
      tutorId: TUTOR_ID,
      badgeId: BADGE_ID,
      earnedAt: new Date(),
    });

    const result = await awardTutorBadge(TUTOR_ID, BADGE_ID);

    expect(result.tutorId).toBe(TUTOR_ID);
  });

  it('no rating-derived field exists anywhere on the returned StudentBadgeDTO', async () => {
    (prisma.studentBadge.findUnique as any).mockResolvedValue(null);
    (prisma.studentBadge.create as any).mockResolvedValue({
      id: 'sb-1',
      studentId: STUDENT_ID,
      badgeId: BADGE_ID,
      earnedAt: new Date(),
      badge: { id: BADGE_ID, name: 'Streaker', criteriaDescription: 'Reach a 7-day streak' },
    });

    const result = await awardStudentBadge(STUDENT_ID, BADGE_ID);

    expect(result).not.toHaveProperty('rating');
    expect(result).not.toHaveProperty('score');
    expect(JSON.stringify(result).toLowerCase()).not.toContain('"rating"');
  });

  it('no rating-derived field exists anywhere on the returned TutorBadgeDTO', async () => {
    (prisma.tutorBadge.findUnique as any).mockResolvedValue(null);
    (prisma.tutorBadge.create as any).mockResolvedValue({
      id: 'tb-1',
      tutorId: TUTOR_ID,
      badgeId: BADGE_ID,
      earnedAt: new Date(),
      badge: {
        id: BADGE_ID,
        name: 'Reliable',
        criteriaDescription: 'Zero tutor-caused misses in 30 days',
      },
    });

    const result = await awardTutorBadge(TUTOR_ID, BADGE_ID);

    expect(result).not.toHaveProperty('rating');
    expect(result).not.toHaveProperty('score');
    expect(JSON.stringify(result).toLowerCase()).not.toContain('"rating"');
  });

  it('re-awarding a badge the student already has — flagged, not hard-asserted', async () => {
    (prisma.studentBadge.findUnique as any).mockResolvedValue({
      id: 'sb-existing',
      studentId: STUDENT_ID,
      badgeId: BADGE_ID,
      earnedAt: new Date(),
    });

    // Doc 8-6 doesn't specify silent no-op vs. upsert vs. unique-constraint
    // error for this path; this test only confirms the call doesn't throw
    // an unrelated/unexpected error, per §9.4's explicit "flagged" note.
    await expect(awardStudentBadge(STUDENT_ID, BADGE_ID)).resolves.toBeDefined();
  });
});

describe.skip('createBadge — I2 fix', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a new badge definition', async () => {
    (prisma.badge.create as any).mockResolvedValue({
      id: BADGE_ID,
      name: 'Quarter Champion',
      description: '...',
      category: 'STUDENT',
      criteriaDescription: 'Reach a 90-day streak',
      isActive: true,
      createdAt: new Date(),
    });

    const result = await createBadge({
      name: 'Quarter Champion',
      description: '...',
      category: 'STUDENT' as any,
      criteriaDescription: 'Reach a 90-day streak',
    });

    expect(result.name).toBe('Quarter Champion');
  });

  it('isActive defaults to true when omitted', async () => {
    (prisma.badge.create as any).mockImplementation((args: any) =>
      Promise.resolve({ id: BADGE_ID, ...args.data }),
    );

    const result = await createBadge({
      name: 'Quarter Champion',
      description: '...',
      category: 'STUDENT' as any,
      criteriaDescription: 'Reach a 90-day streak',
      isActive: undefined,
    });

    expect(result.isActive).toBe(true);
  });

  it('no rating-derived field exists on the created row', async () => {
    (prisma.badge.create as any).mockResolvedValue({
      id: BADGE_ID,
      name: 'Quarter Champion',
      description: '...',
      category: 'STUDENT',
      criteriaDescription: 'Reach a 90-day streak',
      isActive: true,
      createdAt: new Date(),
    });

    const result = await createBadge({
      name: 'Quarter Champion',
      description: '...',
      category: 'STUDENT' as any,
      criteriaDescription: 'Reach a 90-day streak',
    });

    expect(result).not.toHaveProperty('rating');
    expect(JSON.stringify(result).toLowerCase()).not.toContain('"rating"');
  });
});

describe.skip('adminManageBadges', () => {
  beforeEach(() => vi.clearAllMocks());

  it('list mode returns paginated badges filtered by category', async () => {
    (prisma.badge.findMany as any).mockResolvedValue([
      { id: 'b1', category: 'STUDENT', name: 'A', criteriaDescription: 'x', isActive: true },
    ]);
    (prisma.badge.count as any).mockResolvedValue(1);

    const result = await adminManageBadges(1, 20, 'STUDENT' as any);

    expect(result.badges.every((b: any) => b.category === 'STUDENT')).toBe(true);
    expect(prisma.badge.update).not.toHaveBeenCalled();
  });

  it('adjust mode updates criteria/active status', async () => {
    (prisma.badge.update as any).mockResolvedValue({
      id: BADGE_ID,
      isActive: false,
      criteriaDescription: 'Unchanged',
    });

    const result = await adminManageBadges(BADGE_ID, { isActive: false });

    expect(result.isActive).toBe(false);
    expect(result.criteriaDescription).toBe('Unchanged');
  });

  it('the two call shapes are dispatched correctly — list-mode never updates, adjust-mode never runs a paginated findMany', async () => {
    (prisma.badge.findMany as any).mockResolvedValue([]);
    (prisma.badge.count as any).mockResolvedValue(0);
    await adminManageBadges(1, 20, 'STUDENT' as any);
    expect(prisma.badge.update).not.toHaveBeenCalled();

    vi.clearAllMocks();
    (prisma.badge.update as any).mockResolvedValue({ id: BADGE_ID, isActive: true });
    await adminManageBadges(BADGE_ID, { isActive: true });
    expect(prisma.badge.findMany).not.toHaveBeenCalled();
  });
});
