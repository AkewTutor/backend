import { Router } from 'express';
import authMiddleware from '../middlewares/auth.middleware.js';
import validate from '../middlewares/validate.middleware.js';
import * as schema from '../schemas/matching.schema.js';
import * as matchingController from '../controllers/matching.controller.js';

const matchingRouter = Router();

matchingRouter.use(authMiddleware);

matchingRouter.get(
  '/tutors/search',
  validate(schema.searchTutorsQuerySchema),
  matchingController.searchTutors,
);
matchingRouter.get('/tutors/recommendations', matchingController.getRecommendations);
matchingRouter.get('/tutors/:tutorId', matchingController.getTutorDetail);
matchingRouter.post(
  '/select-tutor',
  validate(schema.selectTutorSchema),
  matchingController.selectTutor,
);
matchingRouter.post(
  '/no-exact-match',
  validate(schema.noExactMatchSchema),
  matchingController.noExactMatch,
);
matchingRouter.post('/group-format', matchingController.requestGroupFormat);
matchingRouter.get('/requests/me', matchingController.getMyRequestStatus);

export { matchingRouter };
export default matchingRouter;
