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
  // Only the fields documented for PATCH /tutors/me/profile (Doc 06-02).
  // z.object() strips unknown keys, so verificationStatus & friends can never
  // reach the service (mass-assignment guard), and columns that don't exist
  // on TutorProfile can no longer cause a Prisma 500.
  body: z.object({
    profilePictureUrl: z.string().optional(),
    bio: z.string().optional(),
    experienceDescription: z.string().optional(),
    educationInstitution: z.string().optional(),
    degree: z.string().optional(),
  }),
});
