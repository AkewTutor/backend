// src/schemas/auth.schema.ts
import { z } from 'zod';
import { normalizeContact, normalizeEmail, normalizePhone } from '../utils/contact.js';

const contactFields = {
  email: z.string().trim().email().transform(normalizeEmail).optional(),
  phone: z
    .string()
    .trim()
    .transform((v) => (v ? normalizePhone(v) : undefined))
    .optional(),
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
    identifier: z.string().trim().min(1).transform(normalizeContact),
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
    identifier: z.string().trim().min(1).transform(normalizeContact),
  }),
});

export const passwordResetSchema = z.object({
  body: z.object({
    identifier: z.string().trim().min(1).transform(normalizeContact),
    code: z.string().trim().min(1),
    newPassword: z.string().min(8),
  }),
});

export const verifyContactSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    code: z.string().min(1),
  }),
});

export const resendVerificationSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
  }),
});
