/**
 * tests/routes/weeklyAssessment.routes.test.ts
 *
 * Journey step 4.27. Spec: `09-4-class-delivery-library.md` §9.21.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/weeklyAssessment.service.js', () => ({
  submitAssessment: vi.fn(),
  getAssessmentsForStudent: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    throw new Error('invalid token');
  }),
}));

import * as weeklyAssessmentService from '../../src/services/weeklyAssessment.service.js';
import app from '../../src/app.js';

describe('weeklyAssessment.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (weeklyAssessmentService.submitAssessment as any).mockResolvedValue({
      id: 'assessment-1',
      cohortMembershipId: '11111111-1111-4111-8111-111111111111',
      weekStartDate: '2026-09-01',
      tutorFeedback: 'Strong improvement on quadratic equations this week.',
    });
    (weeklyAssessmentService.getAssessmentsForStudent as any).mockResolvedValue([]);
  });

  it('both routes require auth — 401 with no Authorization header', async () => {
    const submit = await request(app).post('/api/v1/assessments').send({
      cohortMembershipId: '11111111-1111-4111-8111-111111111111',
      weekStartDate: '2026-09-01',
      tutorFeedback: 'Note.',
    });
    const list = await request(app).get(
      '/api/v1/assessments/cohort-membership/11111111-1111-4111-8111-111111111111',
    );

    expect(submit.status).toBe(401);
    expect(list.status).toBe(401);
  });

  it('submit validates body — a request missing tutorFeedback is rejected by validate(submitAssessmentSchema)', async () => {
    const res = await request(app)
      .post('/api/v1/assessments')
      .set('Authorization', 'Bearer tutor-token')
      .send({
        cohortMembershipId: '11111111-1111-4111-8111-111111111111',
        weekStartDate: '2026-09-01',
      });

    expect(res.status).toBe(400);
    expect(weeklyAssessmentService.submitAssessment).not.toHaveBeenCalled();
  });

  it('a valid submit request with a valid token reaches the (mocked) service', async () => {
    const res = await request(app)
      .post('/api/v1/assessments')
      .set('Authorization', 'Bearer tutor-token')
      .send({
        cohortMembershipId: '11111111-1111-4111-8111-111111111111',
        weekStartDate: '2026-09-01',
        tutorFeedback: 'Great work.',
      });

    expect(res.status).toBe(201);
    expect(weeklyAssessmentService.submitAssessment).toHaveBeenCalled();
  });

  it('GET /assessments/cohort-membership/:id with a valid token reaches the (mocked) service', async () => {
    const res = await request(app)
      .get('/api/v1/assessments/cohort-membership/11111111-1111-4111-8111-111111111111')
      .set('Authorization', 'Bearer student-token');

    expect(res.status).toBe(200);
    expect(weeklyAssessmentService.getAssessmentsForStudent).toHaveBeenCalledWith(
      'student-1',
      '11111111-1111-4111-8111-111111111111',
    );
  });
});
