import { Request, Response, NextFunction } from 'express';
import * as adminReportingService from '../services/adminReporting.service.js';

export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await adminReportingService.aggregatePlatformHealth();
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (err) {
    next(err);
  }
};

export const getActivity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, dateRange } = req.query;

    const result = await adminReportingService.getActivityHistory(
      page as string,
      limit as string,
      dateRange as string,
    );
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (err) {
    next(err);
  }
};

export const getTutorPerformance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tutorId, page, limit } = req.query;

    const result = await adminReportingService.getTutorPerformanceHistory(
      tutorId as string,
      page as string,
      limit as string,
    );
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (err) {
    next(err);
  }
};
