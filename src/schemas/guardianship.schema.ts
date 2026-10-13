import { z } from 'zod';
import { normalizeContact } from '../utils/contact.js';

export const addStudentSchema = z.object({
  body: z.object({
    grade: z.number().int().min(1).max(12),
    inviteContact: z.string().trim().min(1).transform(normalizeContact),
  }),
});

export const inviteGuardianSchema = z.object({
  body: z.object({
    inviteContact: z.string().trim().min(1).transform(normalizeContact),
  }),
});

export const revokeRelationshipSchema = z.object({
  body: z
    .object({
      revoke: z.boolean().default(false),
    })
    .default({ revoke: false }),
});

export const activateInviteSchema = z.object({
  params: z.object({
    token: z.string().min(1),
  }),
  body: z.object({
    password: z.string().min(8).optional(),
  }),
});
