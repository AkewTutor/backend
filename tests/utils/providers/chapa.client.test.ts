/**
 * tests/utils/providers/chapa.client.test.ts
 *
 * Phase 7, step 7.1. Spec: `09-7-payments-earnings.md` §9.2.
 * OWASP: A10:2021 – Server-Side Request Forgery (outbound checkout call —
 *        destination host must be fixed, not attacker-influenced),
 *        A02:2021 – Cryptographic Failures (webhook signature verification
 *        correctness).
 *
 * Mocks the underlying Chapa SDK/HTTP call — this file never talks to the
 * real Chapa network (see `09-7-payments-earnings.md` §9.22).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const mockHttpPost = vi.fn();

vi.mock('../../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    CHAPA_SECRET_KEY: 'test-chapa-secret',
    CHAPA_WEBHOOK_SECRET: 'test-webhook-secret',
    CHAPA_BASE_URL: 'https://api.chapa.co',
  },
}));

// The underlying HTTP client chapa.client.ts is expected to use internally
// (an axios instance, fetch wrapper, or similar) — mocked here so this
// suite never performs a real network call.
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: mockHttpPost,
    })),
    post: mockHttpPost,
  },
}));

import {
  initiateCheckout,
  verifyWebhookSignature,
} from '../../../src/utils/providers/chapa.client.js';

const WEBHOOK_SECRET = 'test-webhook-secret';

function signBody(rawBody: Buffer, secret = WEBHOOK_SECRET): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

describe.skip('chapa.client.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initiateCheckout', () => {
    it('targets the fixed Chapa host — none of amount/reference/callbackUrl can influence where the request is sent', async () => {
      mockHttpPost.mockResolvedValue({
        data: {
          status: 'success',
          data: { checkout_url: 'https://checkout.chapa.co/checkout/abc123' },
        },
      });

      await initiateCheckout('350.00', 'payment-ref-1', 'https://akewtutor.example/callback');

      expect(mockHttpPost).toHaveBeenCalledTimes(1);
      const [calledUrl] = mockHttpPost.mock.calls[0];
      expect(String(calledUrl)).toContain('https://api.chapa.co');
      // The attacker-influenced inputs never appear as (part of) the target host.
      expect(String(calledUrl)).not.toContain('payment-ref-1');
      expect(String(calledUrl)).not.toContain('akewtutor.example/callback');
    });

    it('resolves { checkoutUrl } from a successful Chapa response', async () => {
      mockHttpPost.mockResolvedValue({
        data: {
          status: 'success',
          data: { checkout_url: 'https://checkout.chapa.co/checkout/xyz789' },
        },
      });

      const result = await initiateCheckout(
        '350.00',
        'payment-ref-2',
        'https://akewtutor.example/callback',
      );

      expect(result).toEqual({ checkoutUrl: 'https://checkout.chapa.co/checkout/xyz789' });
    });
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a valid signature computed over the exact raw bytes', async () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'SUCCESS', tx_ref: 'payment-ref-3' }));
      const validSignature = signBody(rawBody);

      await expect(verifyWebhookSignature(rawBody, validSignature)).resolves.toBe(true);
    });

    it('rejects a tampered body — signature must be verified against the exact raw bytes, not a re-serialized copy', async () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'SUCCESS', tx_ref: 'payment-ref-4' }));
      const originalSignature = signBody(rawBody);

      // Mutate a single byte of the raw buffer after signing.
      const mutatedBody = Buffer.from(rawBody);
      mutatedBody[mutatedBody.length - 1] = mutatedBody[mutatedBody.length - 1] ^ 0xff;

      await expect(verifyWebhookSignature(mutatedBody, originalSignature)).resolves.toBe(false);
    });

    it('rejects a missing signature header without throwing', async () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'SUCCESS', tx_ref: 'payment-ref-5' }));

      await expect(verifyWebhookSignature(rawBody, undefined as unknown as string)).resolves.toBe(
        false,
      );
    });

    it('rejects a malformed signature header without throwing', async () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'SUCCESS', tx_ref: 'payment-ref-6' }));

      await expect(verifyWebhookSignature(rawBody, 'not-a-real-signature')).resolves.toBe(false);
    });
  });
});
