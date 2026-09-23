import { z } from 'zod';

export const rankSubjectsSchema = z.object({
  body: z.object({
    subjects: z
      .array(
        z.object({
          subjectId: z.string().uuid(),
          rank: z.number().int().min(1).max(2),
        }),
      )
      .max(2)
      .refine((subjects) => {
        const ids = new Set(subjects.map((s) => s.subjectId));
        return ids.size === subjects.length;
      }, 'Duplicate subjectId')
      .refine((subjects) => {
        const ranks = new Set(subjects.map((s) => s.rank));
        return ranks.size === subjects.length;
      }, 'Duplicate rank'),
  }),
});

export const updateTutorProfileSchema = z.object({
  body: z
    .object({
      bio: z.string().optional(),
      videoIntroductionUrl: z.string().optional(),
      // Omitting verificationStatus for mass-assignment guard
    })
    .passthrough()
    .transform((data) => {
      const { verificationStatus, ...rest } = data as any;
      return rest;
    }),
});
