import { Request, Response, NextFunction } from 'express';
import * as pricingService from '../services/pricing.service.js';
import ApiError from '../utils/ApiError.js';

export const getActive = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await pricingService.getActiveConfig();
    return res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: config });
  } catch (error) {
    next(error);
  }
};

export const adminUpdate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const format = req.params.format as string;
    const adminId = (req as any).user?.id;
    if (!adminId) {
      throw new ApiError(401, 'Unauthorized');
    }

    const config = await pricingService.createAndActivateConfig(format, req.body, adminId);
    return res
      .status(201)
      .json({ statusCode: 201, success: true, message: 'Created', data: config });
  } catch (error) {
    next(error);
  }
};
