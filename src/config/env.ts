// src/config/env.ts
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  // NFR-014 — 30-minute access-token TTL (Doc 05a §9).
  JWT_EXPIRES_IN: z.string().default('30m'),
  BCRYPT_SALT_ROUNDS: z.string().default('10'),

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

  // ── class-delivery-library ───────────────────────────────────────
  CLOUDFLARE_R2_ACCESS_KEY: z.string(),
  CLOUDFLARE_R2_SECRET_KEY: z.string(),
  CLOUDFLARE_R2_BUCKET: z.string(),

  // ── prisma/seed.ts ───────────────────────────────────────────────
  ADMIN_SEED_EMAIL: z.string(),
  ADMIN_SEED_PASSWORD: z.string(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
