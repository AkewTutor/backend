import { z } from 'zod';

const optionSchema = z.object({
  text: z.string().trim().min(1, 'Option text is required'),
  isCorrect: z.boolean(),
});

const questionSchema = z
  .object({
    text: z.string().trim().min(1, 'Question text is required'),
    options: z.array(optionSchema).min(2).max(6),
  })
  .refine((q) => q.options.some((o) => o.isCorrect), {
    message: 'Each question needs at least one correct option',
  });

export const createQuizSchema = z.object({
  body: z.object({
    cohortId: z.string().uuid(),
    weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'weekStartDate must be YYYY-MM-DD'),
    title: z.string().trim().max(120).optional(),
    instructions: z.string().trim().min(1, 'Instructions are required'),
    questions: z.array(questionSchema).min(1).max(50),
  }),
});

export const submitAttemptSchema = z.object({
  params: z.object({ quizId: z.string().uuid() }),
  body: z.object({
    answers: z.array(z.array(z.number().int().min(0).max(5)).max(6)),
  }),
});
