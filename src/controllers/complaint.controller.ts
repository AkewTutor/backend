import { Request, Response, NextFunction } from 'express';
import * as complaintService from '../services/complaint.service.js';
import ApiError from '../utils/ApiError.js';

export const fileComplaint = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new ApiError(401, 'Unauthorized');

    const result = await complaintService.createComplaint(user.id, user.role, req.body);
    return res
      .status(201)
      .json({ statusCode: 201, success: true, message: 'Created', data: result });
  } catch (err) {
    next(err);
  }
};

export const listMyComplaints = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new ApiError(401, 'Unauthorized');

    const { status, page, limit } = req.query;

    const parsedPage = page ? parseInt(page as string) : 1;
    const parsedLimit = limit ? parseInt(limit as string) : 20;

    const result = await complaintService.listForUser(
      user.id,
      status as string,
      parsedPage,
      parsedLimit,
    );
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (err) {
    next(err);
  }
};

export const getMyComplaint = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new ApiError(401, 'Unauthorized');

    const complaintId = String(req.params.complaintId);

    const result = await complaintService.getForReporter(user.id, complaintId);
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (err) {
    next(err);
  }
};

export const getSupportContact = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await complaintService.getSupportContactInfo();
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (err) {
    next(err);
  }
};
