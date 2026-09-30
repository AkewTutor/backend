import { Request, Response, NextFunction } from 'express';
import * as promotionService from '../services/promotion.service.js';
import ApiError from '../utils/ApiError.js';

export const listActive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await promotionService.listActivePromotions();
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (err) {
    next(err);
  }
};

export const adminCreate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).user?.id;
    if (!adminId) throw new ApiError(401, 'Unauthorized');

    const result = await promotionService.createPromotion(req.body, adminId);
    return res
      .status(201)
      .json({ statusCode: 201, success: true, message: 'Created', data: result });
  } catch (err) {
    next(err);
  }
};

export const adminEdit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = (req as any).user?.id;
    if (!adminId) throw new ApiError(401, 'Unauthorized');

    const result = await promotionService.updatePromotion(String(req.params.id), req.body);
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (err) {
    next(err);
  }
};
