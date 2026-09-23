import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types/index.js';
import * as availabilityService from '../services/availability.service.js';

export async function setSlots(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await availabilityService.setSlots(req.user!.id, req.body);
    res.status(201).json({ statusCode: 201, success: true, message: 'Created', data: result });
  } catch (error) {
    next(error);
  }
}

export async function listSlots(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await availabilityService.listSlots(req.user!.id);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}

export async function removeSlot(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { slotId } = req.params;
    const result = await availabilityService.removeSlot(req.user!.id, slotId as string);
    res.status(200).json({ statusCode: 200, success: true, message: 'OK', data: result });
  } catch (error) {
    next(error);
  }
}
