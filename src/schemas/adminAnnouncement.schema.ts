// src/schemas/adminAnnouncement.schema.ts
import { z } from 'zod';

const audienceRole = z.enum(['STUDENT', 'PARENT', 'TUTOR']);

export const createAnnouncementSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    audienceRoles: z.array(audienceRole).min(1),
  }),
});
