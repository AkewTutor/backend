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

export const updateAnnouncementSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      title: z.string().trim().min(1).optional(),
      body: z.string().trim().min(1).optional(),
    })
    .refine((v) => v.title !== undefined || v.body !== undefined, {
      message: 'Provide a title or a message to change',
    }),
});

export const deleteAnnouncementSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});
