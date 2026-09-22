// src/schemas/auth.schema.ts
import { z } from 'zod';

const contactFields = {
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(8),
  termsAccepted: z.literal(true),
};

const contactRefine = {
  message: 'email or phone required',
};

export const registerStudentSchema = z.object({
  body: z
    .object({
      ...contactFields,
      grade: z.number().int().min(6).max(12),
    })
    .refine((b) => Boolean(b.email) || Boolean(b.phone), contactRefine),
});

export const registerParentSchema = z.object({
  body: z
    .object({ ...contactFields })
    .refine((b) => Boolean(b.email) || Boolean(b.phone), contactRefine),
});

export const registerTutorSchema = z.object({
  body: z
    .object({ ...contactFields })
    .refine((b) => Boolean(b.email) || Boolean(b.phone), contactRefine),
});

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1),
    password: z.string().min(1),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1),
  }),
});

export const passwordResetRequestSchema = z.object({
  body: z.object({
    identifier: z.string().min(1),
  }),
});

export const passwordResetSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    code: z.string().min(1),
    newPassword: z.string().min(8),
  }),
});

export const verifyContactSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    code: z.string().min(1),
  }),
});
