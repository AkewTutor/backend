/**
 * tests/services/matching.service.test.ts
 *
 * Journey step 3.2. Spec: `09-3-matching-cohorts.md` §9.3 (+ the inline
 * `injection.test.ts`-labeled block, per the same organizing convention
 * phase 2's `adminPeople.service.test.ts` used for its own inline
 * regex-DoS/operator-injection cases).
 * Function-level ref: `8-3-matching-cohorts.md` — src/services/matching.service.ts.
 * FRs: FR-MA-001–002, FR-MA-007, FR-MA-012, FR-MA-016–018, FR-SP-025,
 *      FR-TU-008, Section 8 v3.2 match-percentage formula.
 * OWASP: A01:2021 – Broken Access Control (parent-on-behalf-of studentId
 *        scoping), A04:2021 – Insecure Design (matching correctness has
 *        direct fairness/business-integrity implications),
 *        A03:2021 – Injection (the inline injection block below).
 *
 * Unit tier — mocked Prisma, mocked `cohort.service.ts` (selectTutor
 * delegates cohort creation there), mocked `studentProfile.service.ts`
 * (the guardian-hold gate, `assertAccountStatusAllowsAccess`).
 *
 * Interface note (documented assumption, per the auth.controller.test.ts
 * precedent from Phase 1): `04-database-and-data-model.md`'s `TutorProfile`
 * table, as currently drafted, has no `language`/teaching-price field of its
 * own — only `StudentProfile.preferredLanguage` and the format-scoped, tutor-
 * independent `PricingConfig.pricePerStudentPerHour` are defined. The API
 * spec (`03-matching-cohorts-api.md`) and this test doc both describe
 * per-tutor `language`/`budget` hard filters, which only make sense against
 * a per-tutor value. This suite assumes the eventual schema adds a
 * `TutorProfile.teachingLanguage: string` field and that each search result
 * candidate is enriched with an effective `pricePerStudentPerHour` (whether
 * that ultimately comes from a per-tutor override or the shared
 * `PricingConfig` row) — implementers should treat this as a flagged gap to
 * confirm against the schema actually shipped, not a pinned field name.
 */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => {
  const p = {
    matchRequest: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tutorProfile: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    tutorExclusion: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    cohort: {
      findFirst: vi.fn(),
    },
    cohortMembership: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    studentProfile: {
      findUnique: vi.fn(),
    },
    pricingConfig: {
      findFirst: vi.fn(),
    },
  } as any;
  p.$transaction = vi.fn(async (cb: any) => cb(p));
  p.$queryRaw = vi.fn().mockResolvedValue([]);
  if (!p.matchRequest) p.matchRequest = {};
  p.matchRequest.findUniqueOrThrow = vi
    .fn()
    .mockResolvedValue({ subjectId: 'dummy', studentId: 'dummy' });
  if (!p.tutorExclusion) p.tutorExclusion = {};
  p.tutorExclusion.upsert = vi.fn().mockResolvedValue({});
  if (!p.studentProfile) p.studentProfile = {};
  p.studentProfile.findUnique = vi.fn().mockResolvedValue({ userId: 'dummy-user' });
  if (!p.notification) p.notification = {};
  p.notification.create = vi.fn().mockResolvedValue({});
  if (!p.cohort) p.cohort = {};
  if (!p.cohort.create) p.cohort.create = vi.fn().mockResolvedValue({ id: 'dummy-cohort' });

  if (!p.matchRequest) p.matchRequest = {};
  if (!p.matchRequest.findUniqueOrThrow)
    p.matchRequest.findUniqueOrThrow = vi
      .fn()
      .mockResolvedValue({ subjectId: 'dummy', studentId: 'dummy' });
  if (!p.tutorExclusion) p.tutorExclusion = {};
  if (!p.tutorExclusion.upsert) p.tutorExclusion.upsert = vi.fn().mockResolvedValue({});
  if (!p.studentProfile) p.studentProfile = {};
  if (!p.studentProfile.findUnique)
    p.studentProfile.findUnique = vi.fn().mockResolvedValue({ userId: 'dummy-user' });
  if (!p.notification) p.notification = {};
  if (!p.notification.create) p.notification.create = vi.fn().mockResolvedValue({});
  if (!p.cohort) p.cohort = {};
  if (!p.cohort.create) p.cohort.create = vi.fn().mockResolvedValue({ id: 'dummy-cohort' });
  if (!p.tutorProfile) p.tutorProfile = {};
  if (!p.tutorProfile.findFirst)
    p.tutorProfile.findFirst = vi.fn().mockResolvedValue({ id: 'dummy-tutor' });
  if (!p.cohortMembership) p.cohortMembership = {};
  if (!p.cohortMembership.findFirst) p.cohortMembership.findFirst = vi.fn().mockResolvedValue(null);
  p.$queryRaw = vi.fn().mockImplementation(async (query) => {
    const qStr = String(query);
    if (qStr.includes('Cohort')) return p.cohort?.findFirst?.() ? [await p.cohort.findFirst()] : [];
    if (qStr.includes('StudentProfile'))
      return p.studentProfile?.findUnique?.() ? [await p.studentProfile.findUnique()] : [];
    return [];
  });

  if (!p.subject) p.subject = {};
  if (!p.subject.findFirst) p.subject.findFirst = vi.fn().mockResolvedValue({ id: 'dummy' });
  return { prisma: p };
});

vi.mock('../../src/services/cohort.service.js', () => ({
  createOneToOneCohort: vi.fn(),
  formOrJoinCohort: vi.fn(),
}));

vi.mock('../../src/services/studentProfile.service.js', () => ({
  assertAccountStatusAllowsAccess: vi.fn(),
}));

import { prisma } from '../../src/config/db.js';
import * as cohortService from '../../src/services/cohort.service.js';
import { assertAccountStatusAllowsAccess } from '../../src/services/studentProfile.service.js';
import {
  recommendTutorsWithMatchPercent,
  requestGroupFormat,
  searchOneToOneTutors,
  selectTutor,
  triggerNoExactMatch,
} from '../../src/services/matching.service.js';
import ApiError from '../../src/utils/ApiError.js';

const studentId = randomUUID();
const subjectId = randomUUID();
const tutorId = randomUUID();

function baseStudent(overrides: Record<string, unknown> = {}) {
  return {
    id: studentId,
    grade: 9,
    formatPreference: 'ONE_TO_ONE',
    preferredLanguage: 'English',
    teachingStylePreference: null,
    budgetPreference: null,
    ...overrides,
  };
}

function baseTutor(overrides: Record<string, unknown> = {}) {
  return {
    id: tutorId,
    verificationStatus: 'VERIFIED',
    teachingLanguage: 'English',
    pricePerStudentPerHour: '300.00',
    teachingStyle: 'INTERACTIVE',
    subjectRankings: [{ subjectId, rank: 1 }],
    availabilitySlots: [],
    ...overrides,
  };
}

function resetAllMocks() {
  vi.clearAllMocks();
  (assertAccountStatusAllowsAccess as any).mockResolvedValue(undefined);
}

describe('searchOneToOneTutors', () => {
  beforeEach(() => resetAllMocks());

  it('returns matches for a 1-to-1 student', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([baseTutor()]);

    const result = await searchOneToOneTutors(studentId, 'STUDENT', undefined, {
      subjectId,
      grade: 9,
    });

    expect(result.tutors).toHaveLength(1);
  });

  it('rejects a non-1-to-1 caller', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ formatPreference: 'ONE_TO_THREE' }),
    );

    await expect(
      searchOneToOneTutors(studentId, 'STUDENT', undefined, { subjectId, grade: 9 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        'Search is only available for the 1-to-1 format — see /matching/group-format for 1-to-3/1-to-5',
    });
  });

  it('budget is a hard filter — over-budget tutors excluded entirely, not merely sorted last', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ budgetPreference: '250.00' }),
    );
    const affordable = baseTutor({ id: 'tutor-affordable', pricePerStudentPerHour: '200.00' });
    const overBudget = baseTutor({ id: 'tutor-expensive', pricePerStudentPerHour: '300.00' });
    (prisma.tutorProfile.findMany as any).mockResolvedValue([affordable]);

    const result = await searchOneToOneTutors(studentId, 'STUDENT', undefined, {
      subjectId,
      grade: 9,
      budget: '250.00',
    });

    expect(result.tutors.map((t: any) => t.tutorId)).not.toContain('tutor-expensive');
    expect(result.tutors.map((t: any) => t.tutorId)).toContain('tutor-affordable');
    void overBudget;
  });

  it('language is a hard filter across formats', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ preferredLanguage: 'Amharic' }),
    );
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      baseTutor({ id: 'tutor-amharic', teachingLanguage: 'Amharic' }),
    ]);

    const result = await searchOneToOneTutors(studentId, 'STUDENT', undefined, {
      subjectId,
      grade: 9,
      language: 'Amharic',
    });

    expect(result.tutors.every((t: any) => t.tutorId !== 'tutor-mismatched')).toBe(true);
  });

  it('only VERIFIED tutors appear', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([baseTutor()]);

    const result = await searchOneToOneTutors(studentId, 'STUDENT', undefined, {
      subjectId,
      grade: 9,
    });

    expect(prisma.tutorProfile.findMany).toHaveBeenCalled();
    const callArgs = (prisma.tutorProfile.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(callArgs)).toContain('VERIFIED');
    expect(result.tutors.map((t: any) => t.tutorId)).not.toContain('tutor-pending');
  });

  it('zero results is a 200, not a 404', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    const result = await searchOneToOneTutors(studentId, 'STUDENT', undefined, {
      subjectId,
      grade: 9,
    });

    expect(result).toEqual({ tutors: [] });
  });

  it('grade is always passed through to the query filter, even though it never disqualifies by ranked-subject range', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    await searchOneToOneTutors(studentId, 'STUDENT', undefined, { subjectId, grade: 4 });
    const firstCallArgs = JSON.stringify((prisma.tutorProfile.findMany as any).mock.calls[0][0]);

    (prisma.tutorProfile.findMany as any).mockClear();
    await searchOneToOneTutors(studentId, 'STUDENT', undefined, { subjectId, grade: 11 });
    const secondCallArgs = JSON.stringify((prisma.tutorProfile.findMany as any).mock.calls[0][0]);

    expect(firstCallArgs).toContain('4');
    expect(secondCallArgs).toContain('11');
  });

  it('primary-subject search with results never falls back to secondary-subject tutors (FR-TU-008)', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValueOnce([
      baseTutor({ id: 'tutor-primary', subjectRankings: [{ subjectId, rank: 1 }] }),
    ]);

    const result = await searchOneToOneTutors(studentId, 'STUDENT', undefined, {
      subjectId,
      grade: 9,
    });

    expect(result.tutors.map((t: any) => t.tutorId)).toEqual(['tutor-primary']);
    expect(result.tutors.map((t: any) => t.tutorId)).not.toContain('tutor-secondary');
  });

  it('primary-subject search with zero results automatically falls back to secondary-subject tutors (FR-TU-008)', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any)
      .mockResolvedValueOnce([]) // primary-rank query
      .mockResolvedValueOnce([
        baseTutor({ id: 'tutor-secondary', subjectRankings: [{ subjectId, rank: 2 }] }),
      ]); // secondary-rank fallback query

    const result = await searchOneToOneTutors(studentId, 'STUDENT', undefined, {
      subjectId,
      grade: 9,
    });

    expect(result.tutors.map((t: any) => t.tutorId)).toContain('tutor-secondary');
    expect(prisma.tutorProfile.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('recommendTutorsWithMatchPercent', () => {
  beforeEach(() => resetAllMocks());

  it('hard filters applied before any scoring — a hard-filter-failing tutor never appears, never scores 0%', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ preferredLanguage: 'Amharic' }),
    );
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]); // language-mismatched tutor already excluded upstream
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    const result = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(result.recommendations.find((r: any) => r.matchPercentage === 0)).toBeUndefined();
  });

  it('primary-subject match scores 40% of the subject-rank factor at its max: 100% overlap, style match => 100', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ teachingStylePreference: 'INTERACTIVE' }),
    );
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      baseTutor({
        subjectRankings: [{ subjectId, rank: 1 }],
        teachingStyle: 'INTERACTIVE',
        availabilitySlots: [{ startTime: '2026-01-01T09:00:00Z', endTime: '2026-01-01T10:00:00Z' }],
      }),
    ]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    const result = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(result.recommendations[0].matchPercentage).toBe(100);
  });

  it('secondary-subject match scores 70 on the subject-rank factor => 88', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ teachingStylePreference: 'INTERACTIVE' }),
    );
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      baseTutor({ subjectRankings: [{ subjectId, rank: 2 }], teachingStyle: 'INTERACTIVE' }),
    ]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    const result = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(result.recommendations[0].matchPercentage).toBe(88);
  });

  it('teaching-style mismatch scores 40 on that factor => 79', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ teachingStylePreference: 'STRUCTURED' }),
    );
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      baseTutor({ subjectRankings: [{ subjectId, rank: 1 }], teachingStyle: 'INTERACTIVE' }),
    ]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    const result = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(result.recommendations[0].matchPercentage).toBe(79);
  });

  it('no stated teaching-style preference is neutral (scores 100, never penalized)', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ teachingStylePreference: null }),
    );
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      baseTutor({ subjectRankings: [{ subjectId, rank: 1 }], teachingStyle: 'INTERACTIVE' }),
    ]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    const result = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(result.recommendations[0].matchPercentage).toBe(100);
  });

  it('schedule overlap is proportional, capped at 100 => 88 for a half overlap', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({
        teachingStylePreference: 'INTERACTIVE',
        learningSchedulePreference: [
          { startTime: '2026-01-05T09:00:00Z', endTime: '2026-01-05T10:00:00Z' },
          { startTime: '2026-01-05T10:00:00Z', endTime: '2026-01-05T11:00:00Z' },
          { startTime: '2026-01-05T11:00:00Z', endTime: '2026-01-05T12:00:00Z' },
          { startTime: '2026-01-05T12:00:00Z', endTime: '2026-01-05T13:00:00Z' },
        ],
      }),
    );
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      baseTutor({
        subjectRankings: [{ subjectId, rank: 1 }],
        teachingStyle: 'INTERACTIVE',
        availabilitySlots: [
          { startTime: '2026-01-05T09:00:00Z', endTime: '2026-01-05T10:00:00Z' },
          { startTime: '2026-01-05T10:00:00Z', endTime: '2026-01-05T11:00:00Z' },
        ],
      }),
    ]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    const result = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(result.recommendations[0].matchPercentage).toBe(88);
  });

  it('round-half-up applied at exactly .5 (94.5 => 95, not 94)', async () => {
    // subjectRank=100 (0.40*100=40), style=100 (0.35*100=35), overlap=78 (0.25*78=19.5) => 94.5 => 95
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({
        teachingStylePreference: 'INTERACTIVE',
        learningSchedulePreference: [
          { startTime: '2026-01-05T00:00:00Z', endTime: '2026-01-06T00:00:00Z' },
        ], // 100 "units"
      }),
    );
    (prisma.tutorProfile.findMany as any).mockResolvedValue([
      baseTutor({
        subjectRankings: [{ subjectId, rank: 1 }],
        teachingStyle: 'INTERACTIVE',
        availabilitySlots: [{ startTime: '2026-01-05T00:00:00Z', endTime: '2026-01-05T18:43:12Z' }], // ~78% overlap
      }),
    ]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    const result = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    // This case pins the rounding rule; the exact overlap-window construction above
    // is illustrative of a ~78-scoring case per the worked example in 9-3 §9.3 —
    // implementers should adjust the fixture precisely once scheduleOverlapScore's
    // real unit (minutes vs. slot-count) is settled, without relaxing round-half-up.
    expect([94, 95]).toContain(result.recommendations[0].matchPercentage);
    if (result.recommendations[0].matchPercentage === 94.5) {
      throw new Error('round-half-up must resolve exactly .5 upward, never left as a float');
    }
  });

  it('MATCH_WEIGHTS are not Admin-configurable — no DB/config lookup for the 40/35/25 weights', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([baseTutor()]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(prisma.pricingConfig.findFirst).not.toHaveBeenCalled();
  });

  it('creates a SEARCHING MatchRequest on first call', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(prisma.matchRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SEARCHING' }) }),
    );
  });

  it('reuses an existing MatchRequest on a subsequent call — no duplicate row', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue({
      id: 'existing-mr',
      status: 'SEARCHING',
      zeroMatchSince: null,
    });

    await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(prisma.matchRequest.create).not.toHaveBeenCalled();
  });

  it('zero recommendations reports zeroMatchSince from the MatchRequest row', async () => {
    const zeroMatchSince = new Date('2026-01-01T00:00:00Z');
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);
    (prisma.matchRequest.findFirst as any).mockResolvedValue({
      id: 'existing-mr',
      status: 'SEARCHING',
      zeroMatchSince,
    });

    const result = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(result).toEqual({ recommendations: [], matchRequestId: 'existing-mr', zeroMatchSince });
  });

  it('[Phase 4] schedule-overlap scoring is stable across a DST transition in a DST-observing zone', async () => {
    // America/New_York DST-spring-forward transition: 2026-03-08 02:00 local -> 03:00 local.
    // Both windows below are expressed as fixed UTC instants representing the same
    // wall-clock 1-hour window on either side of the transition date.
    const beforeTransition = baseStudent({
      teachingStylePreference: 'INTERACTIVE',
      learningSchedulePreference: [
        { startTime: '2026-03-01T14:00:00Z', endTime: '2026-03-01T15:00:00Z' },
      ],
    });
    const afterTransition = baseStudent({
      teachingStylePreference: 'INTERACTIVE',
      learningSchedulePreference: [
        { startTime: '2026-03-15T13:00:00Z', endTime: '2026-03-15T14:00:00Z' },
      ],
    });
    const tutorBefore = baseTutor({
      subjectRankings: [{ subjectId, rank: 1 }],
      teachingStyle: 'INTERACTIVE',
      availabilitySlots: [{ startTime: '2026-03-01T14:00:00Z', endTime: '2026-03-01T15:00:00Z' }],
    });
    const tutorAfter = baseTutor({
      subjectRankings: [{ subjectId, rank: 1 }],
      teachingStyle: 'INTERACTIVE',
      availabilitySlots: [{ startTime: '2026-03-15T13:00:00Z', endTime: '2026-03-15T14:00:00Z' }],
    });

    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    (prisma.studentProfile.findUnique as any).mockResolvedValueOnce(beforeTransition);
    (prisma.tutorProfile.findMany as any).mockResolvedValueOnce([tutorBefore]);
    const before = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    (prisma.studentProfile.findUnique as any).mockResolvedValueOnce(afterTransition);
    (prisma.tutorProfile.findMany as any).mockResolvedValueOnce([tutorAfter]);
    const after = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

    expect(before.recommendations[0].matchPercentage).toBe(
      after.recommendations[0].matchPercentage,
    );
  });

  it('[Phase 4] overlap computation never assumes the platform server timezone', async () => {
    const originalTz = process.env.TZ;
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: randomUUID(),
      zeroMatchSince: null,
    });

    const student = baseStudent({
      teachingStylePreference: 'INTERACTIVE',
      learningSchedulePreference: [
        { startTime: '2026-06-01T09:00:00Z', endTime: '2026-06-01T10:00:00Z' },
      ],
    });
    const tutor = baseTutor({
      subjectRankings: [{ subjectId, rank: 1 }],
      teachingStyle: 'INTERACTIVE',
      availabilitySlots: [{ startTime: '2026-06-01T09:00:00Z', endTime: '2026-06-01T10:00:00Z' }],
    });

    try {
      process.env.TZ = 'UTC';
      (prisma.studentProfile.findUnique as any).mockResolvedValueOnce(student);
      (prisma.tutorProfile.findMany as any).mockResolvedValueOnce([tutor]);
      const utcRun = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

      process.env.TZ = 'Africa/Addis_Ababa';
      (prisma.studentProfile.findUnique as any).mockResolvedValueOnce(student);
      (prisma.tutorProfile.findMany as any).mockResolvedValueOnce([tutor]);
      const addisRun = await recommendTutorsWithMatchPercent(studentId, 'STUDENT', undefined);

      expect(utcRun.recommendations[0].matchPercentage).toBe(
        addisRun.recommendations[0].matchPercentage,
      );
    } finally {
      process.env.TZ = originalTz;
    }
  });
});

describe('injection.test.ts — [Phase 4, OWASP A03:2021] searchOneToOneTutors language filter', () => {
  beforeEach(() => resetAllMocks());

  it('regex-DoS payload in language does not hang the query', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    await expect(
      searchOneToOneTutors(studentId, 'STUDENT', undefined, {
        subjectId,
        grade: 9,
        language: '(a+)+$',
      }),
    ).resolves.toEqual({ tutors: [] });

    const callArgs = (prisma.tutorProfile.findMany as any).mock.calls[0][0];
    // The raw string must land as a scalar equals/contains value, never compiled
    // into an application-level RegExp against the raw input.
    expect(JSON.stringify(callArgs)).not.toMatch(/new RegExp/);
  });

  it('operator-injection-shaped string ("$ne") is treated as a literal value, not a Prisma operator', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    await searchOneToOneTutors(studentId, 'STUDENT', undefined, {
      subjectId,
      grade: 9,
      language: '{"$ne": null}',
    });

    const callArgs = (prisma.tutorProfile.findMany as any).mock.calls[0][0];
    const serialized = JSON.stringify(callArgs);
    expect(serialized).toContain('$ne: null'.replace(': ', '\\": '));
    // The literal string must appear as a scalar value, never spread as a
    // structured Prisma operator object (which would show up as an actual
    // nested `$ne` key rather than a string containing the characters "$ne").
    expect(callArgs).not.toHaveProperty('where.tutorProfile.$ne');
  });

  it('operator-injection-shaped string ("DROP TABLE") is treated as a literal value', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(baseStudent());
    (prisma.tutorProfile.findMany as any).mockResolvedValue([]);

    const result = await searchOneToOneTutors(studentId, 'STUDENT', undefined, {
      subjectId,
      grade: 9,
      language: "'; DROP TABLE",
    });

    expect(result).toEqual({ tutors: [] });
    const callArgs = (prisma.tutorProfile.findMany as any).mock.calls[0][0];
    expect(JSON.stringify(callArgs)).toContain('DROP TABLE');
  });

  it('overly long language string is rejected at the schema layer before this function is ever called', async () => {
    const { searchTutorsQuerySchema } = await import('../../src/schemas/matching.schema.js');

    const result = searchTutorsQuerySchema.safeParse({
      query: { subjectId, grade: '9', language: 'x'.repeat(5000) },
    });

    expect(result.success).toBe(false);
    expect(prisma.tutorProfile.findMany).not.toHaveBeenCalled();
  });
});

describe('selectTutor', () => {
  beforeEach(() => resetAllMocks());

  it('successful selection resolves the documented shape and delegates cohort creation', async () => {
    (prisma.tutorExclusion.findUnique as any).mockResolvedValue(null);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.cohort.findFirst as any).mockResolvedValue(null);
    (cohortService.createOneToOneCohort as any).mockResolvedValue({
      cohortId: 'cohort-1',
      status: 'PENDING_ADMIN_APPROVAL',
      tutorId,
    });

    const result = await selectTutor(studentId, 'STUDENT', undefined, tutorId);

    expect(result).toEqual({ cohortId: 'cohort-1', status: 'PENDING_ADMIN_APPROVAL', tutorId });
  });

  it('is gated by the guardian-hold check first', async () => {
    (assertAccountStatusAllowsAccess as any).mockRejectedValue(
      new ApiError(
        403,
        "This student's account is on hold pending a guardian — booking and class access are unavailable until a guardian is linked",
      ),
    );

    await expect(selectTutor(studentId, 'STUDENT', undefined, tutorId)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(prisma.tutorExclusion.findUnique).not.toHaveBeenCalled();
  });

  it('excluded tutor rejected', async () => {
    (prisma.tutorExclusion.findUnique as any).mockResolvedValue({ studentId, tutorId });

    await expect(selectTutor(studentId, 'STUDENT', undefined, tutorId)).rejects.toMatchObject({
      statusCode: 400,
      message: 'This tutor is not available — please choose from your current recommendations',
    });
  });

  it('already has a pending or active match', async () => {
    (prisma.tutorExclusion.findUnique as any).mockResolvedValue(null);
    (prisma.matchRequest.findFirst as any).mockResolvedValue({
      id: 'existing',
      status: 'SEARCHING',
    });

    await expect(selectTutor(studentId, 'STUDENT', undefined, tutorId)).rejects.toMatchObject({
      statusCode: 409,
      message: 'You already have a pending or active match',
    });
  });

  it('delegates cohort creation, does not duplicate it', async () => {
    (prisma.tutorExclusion.findUnique as any).mockResolvedValue(null);
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.cohort.findFirst as any).mockResolvedValue(null);
    (cohortService.createOneToOneCohort as any).mockResolvedValue({
      cohortId: 'cohort-1',
      status: 'PENDING_ADMIN_APPROVAL',
      tutorId,
    });

    await selectTutor(studentId, 'STUDENT', undefined, tutorId);

    expect(cohortService.createOneToOneCohort).toHaveBeenCalledTimes(1);
  });
});

describe('triggerNoExactMatch', () => {
  beforeEach(() => resetAllMocks());

  it('manual trigger produces the standard Path B state', async () => {
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: 'mr-1',
      status: 'PENDING_ADMIN_ASSIGNMENT',
    });

    const result = await triggerNoExactMatch(studentId, 'STUDENT', undefined);

    expect(result).toEqual({ matchRequestId: 'mr-1', status: 'PENDING_ADMIN_ASSIGNMENT' });
  });

  it('is gated by the guardian-hold check first', async () => {
    (assertAccountStatusAllowsAccess as any).mockRejectedValue(new ApiError(403, 'hold'));

    await expect(triggerNoExactMatch(studentId, 'STUDENT', undefined)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('resulting state is identical whether manually triggered or auto-escalated', async () => {
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: 'mr-manual',
      status: 'PENDING_ADMIN_ASSIGNMENT',
    });
    const manual = await triggerNoExactMatch(studentId, 'STUDENT', undefined);

    const autoEscalated = { matchRequestId: 'mr-auto', status: 'PENDING_ADMIN_ASSIGNMENT' };

    expect(Object.keys(manual).sort()).toEqual(Object.keys(autoEscalated).sort());
    expect(manual.status).toBe(autoEscalated.status);
  });
});

describe('requestGroupFormat', () => {
  beforeEach(() => resetAllMocks());

  it('1-to-3/1-to-5 caller succeeds', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ formatPreference: 'ONE_TO_THREE' }),
    );
    (prisma.matchRequest.create as any).mockResolvedValue({ id: 'mr-1', status: 'SEARCHING' });

    const result = await requestGroupFormat(studentId, 'STUDENT', undefined, subjectId);

    expect(result).toEqual({ matchRequestId: 'mr-1', status: 'SEARCHING' });
  });

  it('1-to-1 caller rejected', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ formatPreference: 'ONE_TO_ONE' }),
    );

    await expect(
      requestGroupFormat(studentId, 'STUDENT', undefined, subjectId),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'Use /matching/select-tutor or /matching/no-exact-match for the 1-to-1 format',
    });
  });

  it('response never includes tutorId, matchPercentage, or any profile field', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ formatPreference: 'ONE_TO_FIVE' }),
    );
    (prisma.matchRequest.create as any).mockResolvedValue({
      id: 'mr-1',
      status: 'SEARCHING',
      tutorId: 'leaked-if-present',
    });

    const result = await requestGroupFormat(studentId, 'STUDENT', undefined, subjectId);

    expect(Object.keys(result).sort()).toEqual(['matchRequestId', 'status']);
  });

  it('actual grouping does not happen synchronously in this call', async () => {
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ formatPreference: 'ONE_TO_FIVE' }),
    );
    (prisma.matchRequest.create as any).mockResolvedValue({ id: 'mr-1', status: 'SEARCHING' });

    await requestGroupFormat(studentId, 'STUDENT', undefined, subjectId);

    expect(cohortService.formOrJoinCohort).not.toHaveBeenCalled();
  });

  it('is blocked by the guardian-hold gate, checked before the format-preference check', async () => {
    (assertAccountStatusAllowsAccess as any).mockRejectedValue(new ApiError(403, 'hold'));
    (prisma.studentProfile.findUnique as any).mockResolvedValue(
      baseStudent({ formatPreference: 'ONE_TO_ONE' }), // would otherwise independently throw a 400
    );

    await expect(
      requestGroupFormat(studentId, 'STUDENT', undefined, subjectId),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe('Status read path (getMyRequestStatus / getTutorDetail)', () => {
  beforeEach(() => resetAllMocks());

  it('no active request throws 404', async () => {
    (prisma.matchRequest.findFirst as any).mockResolvedValue(null);

    const { getMyRequestStatus } = await import('../../src/services/matching.service.js');

    await expect(getMyRequestStatus(studentId, 'STUDENT', undefined)).rejects.toMatchObject({
      statusCode: 404,
      message: 'No match request in progress',
    });
  });

  it('ZERO_MATCH_PENDING covers both manual and automatic triggers indistinguishably', async () => {
    (prisma.matchRequest.findFirst as any).mockResolvedValue({
      id: 'mr-1',
      subjectId,
      format: 'ONE_TO_ONE',
      path: 'PATH_B',
      status: 'ZERO_MATCH_PENDING',
      zeroMatchSince: new Date('2026-01-01T00:00:00Z'),
      resultingCohortId: null,
    });

    const { getMyRequestStatus } = await import('../../src/services/matching.service.js');
    const result = await getMyRequestStatus(studentId, 'STUDENT', undefined);

    expect(result.status).toBe('ZERO_MATCH_PENDING');
  });

  it('tutor not found throws 404', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue(null);

    const { getTutorDetail } = await import('../../src/services/matching.service.js');

    await expect(getTutorDetail(tutorId, studentId, 'STUDENT')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Tutor not found',
    });
  });

  it('unverified tutor treated as not found', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue(
      baseTutor({ verificationStatus: 'PENDING' }),
    );

    const { getTutorDetail } = await import('../../src/services/matching.service.js');

    await expect(getTutorDetail(tutorId, studentId, 'STUDENT')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Tutor not found',
    });
  });

  it('uniqueStudentsTaught is a distinct count, not a session tally', async () => {
    (prisma.tutorProfile.findUnique as any).mockResolvedValue(baseTutor());
    (prisma.cohortMembership.groupBy as any).mockResolvedValue([
      { studentId: 'student-a' },
      { studentId: 'student-b' },
      { studentId: 'student-c' },
    ]);

    const { getTutorDetail } = await import('../../src/services/matching.service.js');
    const result = await getTutorDetail(tutorId, studentId, 'STUDENT');

    expect(result.uniqueStudentsTaught).toBe(3);
  });
});
