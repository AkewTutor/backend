import { Request, Response, NextFunction } from 'express';
import { SuccessResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';
import * as libraryService from '../services/library.service.js';
import ApiError from '../utils/ApiError.js';

export const upload = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: tutorId } = (req as any).user;
    const { cohortId, title, fileType } = req.body;
    const file = req.file;
    if (!file) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'File is required');
    }

    const result = await libraryService.uploadMaterial(
      tutorId,
      cohortId,
      title,
      fileType,
      file.buffer,
    );
    res
      .status(HTTP_STATUS.CREATED)
      .json(new SuccessResponse(HTTP_STATUS.CREATED, 'Created', result));
  } catch (error) {
    next(error);
  }
};

export const listForCohort = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = (req as any).user;
    const cohortId = req.params.cohortId as string;
    const result = await libraryService.listCohortMaterials(id, cohortId);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const adminOverride = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id: adminId } = (req as any).user;
    const materialId = req.params.id as string;
    const updates = req.body;
    const result = await libraryService.adminManageLibrary(materialId, adminId, updates);
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};

export const adminRecordingCompliance = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await libraryService.adminRecordingCompliance();
    res.status(HTTP_STATUS.OK).json(new SuccessResponse(HTTP_STATUS.OK, 'OK', result));
  } catch (error) {
    next(error);
  }
};
