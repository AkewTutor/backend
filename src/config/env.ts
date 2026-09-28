// src/config/env.ts
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3000'),
    DATABASE_URL: z.string(),
    JWT_SECRET: z.string(),
    // NFR-014 — 30-minute access-token TTL (Doc 05a §9).
    JWT_EXPIRES_IN: z.string().default('30m'),
    BCRYPT_SALT_ROUNDS: z.string().default('10'),
    CLIENT_URL: z.string().default('http://localhost:3000'),

    // ── shared-config ────────────────────────────────────────────────
    // Both provider base URLs are declared here even though Doc 05a §9's
    // env-additions list only named the API keys. The mirrored client tests
    // read process.env.<PROVIDER>_BASE_URL directly (Rule 1: the test is the
    // spec), and declaring them keeps a future refactor to env.X from
    // silently reading undefined via z.object()'s key-stripping.
    GEEZ_SMS_API_KEY: z.string(),
    GEEZ_SMS_BASE_URL: z.string(),
    BREVO_API_KEY: z.string(),
    BREVO_SENDER_EMAIL: z.string(),
    BREVO_BASE_URL: z.string(),

    // ── payments-earnings ────────────────────────────────────────────
    CHAPA_API_KEY: z.string(),

    // ── class-delivery-library (S3-compatible object storage) ───────────────────────────────────────
    STORAGE_ACCESS_KEY_ID: z.string(),
    STORAGE_SECRET_ACCESS_KEY: z.string(),
    STORAGE_BUCKET: z.string(),
    // S3-compatible provider (Backblaze B2: https://s3.<region>.backblazeb2.com).
    // Required in production. Region is derived from the endpoint when omitted.
    STORAGE_ENDPOINT: z.string().optional(),
    STORAGE_REGION: z.string().optional(),

    // ── prisma/seed.ts ───────────────────────────────────────────────
    ADMIN_SEED_EMAIL: z.string(),
    ADMIN_SEED_PASSWORD: z.string(),
    CHAPA_SECRET_KEY: z.string().default('dummy-chapa-secret'),
    CHAPA_WEBHOOK_SECRET: z.string().default('dummy-chapa-webhook-secret'),
    CHAPA_BASE_URL: z.string().default('https://api.chapa.co/v1'),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV !== 'production') return;
    const bad = (path: string, msg: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message: msg });
    if (!v.STORAGE_ENDPOINT) bad('STORAGE_ENDPOINT', 'required in production');
    if (v.CHAPA_SECRET_KEY.startsWith('dummy-'))
      bad('CHAPA_SECRET_KEY', 'must be set in production');
    if (v.CHAPA_WEBHOOK_SECRET.startsWith('dummy-'))
      bad('CHAPA_WEBHOOK_SECRET', 'must be set in production');
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
