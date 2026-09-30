import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

export const getPauseStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cohortMembershipId = req.query.cohortMembershipId as string;
    if (!cohortMembershipId) {
      throw new ApiError(400, 'cohortMembershipId is required');
    }

    const pause = await prisma.paymentPause.findFirst({
      where: { cohortMembershipId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    if (!pause) {
      return res
        .status(200)
        .json({ statusCode: 200, success: true, message: 'OK', data: { isPaused: false } });
    }

    const sessions = await prisma.scheduledSession.findMany({
      where: {
        cohort: { memberships: { some: { id: cohortMembershipId } } },
        scheduledStart: { gte: pause.startedAt },
      },
      orderBy: { scheduledStart: 'asc' },
    });

    return res.status(200).json({
      statusCode: 200,
      success: true,
      message: 'OK',
      data: {
        isPaused: true,
        reason: pause.reason,
        affectedSessions: sessions.map((s) => ({
          sessionId: s.id,
          status: s.status,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};
