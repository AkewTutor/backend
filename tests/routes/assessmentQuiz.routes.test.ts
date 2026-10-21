/**
 * tests/routes/assessmentQuiz.routes.test.ts
 *
 * Route wiring for /assessment-quizzes: auth, role guards, validation, controller -> service.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/utils/profileIds.js', () => ({
  resolveCallerProfileId: async (u: { id: string }) => u.id,
  resolveGamificationCallerId: async (u: { id: string }) => u.id,
}));

vi.mock('../../src/services/assessmentQuiz.service.js', () => ({
  createQuiz: vi.fn(),
  updateQuiz: vi.fn(),
  deleteQuiz: vi.fn(),
  resetAttempt: vi.fn(),
  getQuizzesForCohort: vi.fn(),
  submitAttempt: vi.fn(),
  getAssessmentHistory: vi.fn(),
}));

vi.mock('../../src/utils/jwt.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn((token: string) => {
    if (token === 'tutor-token') return { id: 'tutor-1', role: 'TUTOR' };
    if (token === 'student-token') return { id: 'student-1', role: 'STUDENT' };
    if (token === 'admin-token') return { id: 'admin-1', role: 'ADMIN' };
    if (token === 'parent-token') return { id: 'parent-1', role: 'PARENT' };
    throw new Error('invalid token');
  }),
}));

import * as quizService from '../../src/services/assessmentQuiz.service.js';
import app from '../../src/app.js';

const BASE = '/api/v1/assessment-quizzes';
const ID = '11111111-1111-4111-8111-111111111111';

const validQuiz = {
  cohortId: ID,
  weekStartDate: '2026-09-01',
  title: 'Week 1',
  instructions: 'Answer all questions.',
  questions: [
    {
      text: '2 + 2?',
      options: [
        { text: '3', isCorrect: false },
        { text: '4', isCorrect: true },
      ],
    },
  ],
};

describe('assessmentQuiz.routes.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (quizService.createQuiz as any).mockResolvedValue({ id: 'quiz-1' });
    (quizService.updateQuiz as any).mockResolvedValue({ id: 'quiz-1' });
    (quizService.deleteQuiz as any).mockResolvedValue({ id: 'quiz-1', deleted: true });
    (quizService.resetAttempt as any).mockResolvedValue({ id: 'attempt-1' });
    (quizService.getQuizzesForCohort as any).mockResolvedValue([]);
    (quizService.submitAttempt as any).mockResolvedValue({ id: 'attempt-1', score: 1 });
    (quizService.getAssessmentHistory as any).mockResolvedValue([]);
  });

  it('every route requires auth (401 without a token)', async () => {
    const calls = [
      request(app).post(BASE).send(validQuiz),
      request(app).get(`${BASE}/cohort/${ID}`),
      request(app).get(`${BASE}/history`),
      request(app).post(`${BASE}/attempts/${ID}/reset`),
      request(app)
        .post(`${BASE}/${ID}/attempts`)
        .send({ answers: [[1]] }),
      request(app).patch(`${BASE}/${ID}`).send({ title: 'x' }),
      request(app).delete(`${BASE}/${ID}`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  describe('role guards (403)', () => {
    it('student cannot create, update, delete or reset', async () => {
      const auth = 'Bearer student-token';
      expect(
        (await request(app).post(BASE).set('Authorization', auth).send(validQuiz)).status,
      ).toBe(403);
      expect(
        (await request(app).patch(`${BASE}/${ID}`).set('Authorization', auth).send({ title: 'x' }))
          .status,
      ).toBe(403);
      expect((await request(app).delete(`${BASE}/${ID}`).set('Authorization', auth)).status).toBe(
        403,
      );
      expect(
        (await request(app).post(`${BASE}/attempts/${ID}/reset`).set('Authorization', auth)).status,
      ).toBe(403);
      expect(quizService.createQuiz).not.toHaveBeenCalled();
    });

    it('tutor cannot submit an attempt or read history', async () => {
      const auth = 'Bearer tutor-token';
      expect(
        (
          await request(app)
            .post(`${BASE}/${ID}/attempts`)
            .set('Authorization', auth)
            .send({ answers: [[1]] })
        ).status,
      ).toBe(403);
      expect((await request(app).get(`${BASE}/history`).set('Authorization', auth)).status).toBe(
        403,
      );
      expect(quizService.submitAttempt).not.toHaveBeenCalled();
    });

    it('admin and parent cannot list a cohort quizzes or submit', async () => {
      expect(
        (await request(app).get(`${BASE}/cohort/${ID}`).set('Authorization', 'Bearer admin-token'))
          .status,
      ).toBe(403);
      expect(
        (await request(app).get(`${BASE}/cohort/${ID}`).set('Authorization', 'Bearer parent-token'))
          .status,
      ).toBe(403);
      expect(
        (
          await request(app)
            .post(`${BASE}/${ID}/attempts`)
            .set('Authorization', 'Bearer parent-token')
            .send({ answers: [[1]] })
        ).status,
      ).toBe(403);
    });
  });

  describe('validation (400)', () => {
    it('create rejects missing instructions', async () => {
      const { instructions, ...body } = validQuiz;
      const res = await request(app)
        .post(BASE)
        .set('Authorization', 'Bearer tutor-token')
        .send(body);
      expect(res.status).toBe(400);
      expect(quizService.createQuiz).not.toHaveBeenCalled();
    });

    it('create rejects a question with no correct option', async () => {
      const body = {
        ...validQuiz,
        questions: [
          {
            text: 'Q',
            options: [
              { text: 'a', isCorrect: false },
              { text: 'b', isCorrect: false },
            ],
          },
        ],
      };
      const res = await request(app)
        .post(BASE)
        .set('Authorization', 'Bearer tutor-token')
        .send(body);
      expect(res.status).toBe(400);
    });

    it('create rejects a bad weekStartDate format', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', 'Bearer tutor-token')
        .send({ ...validQuiz, weekStartDate: '01-09-2026' });
      expect(res.status).toBe(400);
    });

    it('update rejects an empty body and a non-uuid quizId', async () => {
      const auth = 'Bearer tutor-token';
      expect(
        (await request(app).patch(`${BASE}/${ID}`).set('Authorization', auth).send({})).status,
      ).toBe(400);
      expect(
        (
          await request(app)
            .patch(`${BASE}/not-a-uuid`)
            .set('Authorization', auth)
            .send({ title: 'x' })
        ).status,
      ).toBe(400);
    });

    it('delete and reset reject non-uuid ids', async () => {
      const auth = 'Bearer tutor-token';
      expect((await request(app).delete(`${BASE}/nope`).set('Authorization', auth)).status).toBe(
        400,
      );
      expect(
        (await request(app).post(`${BASE}/attempts/nope/reset`).set('Authorization', auth)).status,
      ).toBe(400);
    });

    it('submit rejects non-array answers', async () => {
      const res = await request(app)
        .post(`${BASE}/${ID}/attempts`)
        .set('Authorization', 'Bearer student-token')
        .send({ answers: 'abc' });
      expect(res.status).toBe(400);
      expect(quizService.submitAttempt).not.toHaveBeenCalled();
    });

    it('history rejects a non-uuid studentId', async () => {
      const res = await request(app)
        .get(`${BASE}/history?studentId=nope`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(400);
    });
  });

  describe('happy paths', () => {
    it('POST / (tutor) -> 201 and calls createQuiz(callerId, body)', async () => {
      const res = await request(app)
        .post(BASE)
        .set('Authorization', 'Bearer tutor-token')
        .send(validQuiz);
      expect(res.status).toBe(201);
      expect(quizService.createQuiz).toHaveBeenCalledWith(
        'tutor-1',
        expect.objectContaining({ cohortId: ID }),
      );
    });

    it('PATCH /:quizId (tutor) -> 200', async () => {
      const res = await request(app)
        .patch(`${BASE}/${ID}`)
        .set('Authorization', 'Bearer tutor-token')
        .send({ title: 'New' });
      expect(res.status).toBe(200);
      expect(quizService.updateQuiz).toHaveBeenCalledWith('tutor-1', ID, { title: 'New' });
    });

    it('DELETE /:quizId (tutor) -> 200', async () => {
      const res = await request(app)
        .delete(`${BASE}/${ID}`)
        .set('Authorization', 'Bearer tutor-token');
      expect(res.status).toBe(200);
      expect(quizService.deleteQuiz).toHaveBeenCalledWith('tutor-1', ID);
    });

    it('POST /attempts/:attemptId/reset (tutor) -> 200', async () => {
      const res = await request(app)
        .post(`${BASE}/attempts/${ID}/reset`)
        .set('Authorization', 'Bearer tutor-token');
      expect(res.status).toBe(200);
      expect(quizService.resetAttempt).toHaveBeenCalledWith('tutor-1', ID);
    });

    it('GET /cohort/:cohortId works for tutor and student and passes the role', async () => {
      const t = await request(app)
        .get(`${BASE}/cohort/${ID}`)
        .set('Authorization', 'Bearer tutor-token');
      const s = await request(app)
        .get(`${BASE}/cohort/${ID}`)
        .set('Authorization', 'Bearer student-token');
      expect(t.status).toBe(200);
      expect(s.status).toBe(200);
      expect(quizService.getQuizzesForCohort).toHaveBeenCalledWith('tutor-1', 'TUTOR', ID);
      expect(quizService.getQuizzesForCohort).toHaveBeenCalledWith('student-1', 'STUDENT', ID);
    });

    it('POST /:quizId/attempts (student) -> 201 and passes answers', async () => {
      const res = await request(app)
        .post(`${BASE}/${ID}/attempts`)
        .set('Authorization', 'Bearer student-token')
        .send({ answers: [[1]] });
      expect(res.status).toBe(201);
      expect(quizService.submitAttempt).toHaveBeenCalledWith('student-1', ID, [[1]]);
    });

    it('GET /history works for admin and parent and forwards q/studentId', async () => {
      const a = await request(app)
        .get(`${BASE}/history?q=s6&studentId=${ID}`)
        .set('Authorization', 'Bearer admin-token');
      const p = await request(app)
        .get(`${BASE}/history`)
        .set('Authorization', 'Bearer parent-token');
      expect(a.status).toBe(200);
      expect(p.status).toBe(200);
      expect(quizService.getAssessmentHistory).toHaveBeenCalledWith('admin-1', 'ADMIN', {
        q: 's6',
        studentId: ID,
      });
      expect(quizService.getAssessmentHistory).toHaveBeenCalledWith('parent-1', 'PARENT', {
        q: undefined,
        studentId: undefined,
      });
    });
  });
});
