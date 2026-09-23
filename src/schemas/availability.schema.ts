import { z } from 'zod';

export const createSlotSchema = z.object({
  body: z
    .object({
      isRecurring: z.boolean(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
    })
    .refine((data) => {
      if (data.isRecurring && data.dayOfWeek === undefined) return false;
      return true;
    }, 'dayOfWeek is required when isRecurring is true')
    .refine((data) => {
      return new Date(data.endTime) > new Date(data.startTime);
    }, 'endTime must be after startTime'),
});

export const deleteSlotSchema = z.object({
  params: z.object({
    slotId: z.string().uuid(),
  }),
});
