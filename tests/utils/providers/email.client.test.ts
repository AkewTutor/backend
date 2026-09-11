/**
 * tests/utils/providers/email.client.test.ts
 *
 * Journey step 1.10. Spec: `09-1-shared-config.md` §9.11.
 * OWASP: A10:2021 – Server-Side Request Forgery, A02:2021 – Cryptographic Failures.
 *
 * `emailClient.send(to, subjectOrTemplate, body)` implements the shared
 * `NotificationProviderClient` contract. The underlying HTTP call (global
 * `fetch`) is mocked; nothing here dials the real Brevo sandbox.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { send } from '../../../src/utils/providers/email.client.js';

describe.skip('email.client.ts — send', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('successful send resolves { success: true, providerRef }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ messageId: 'brevo-ref-abc' }),
      }),
    );

    const result = await send(
      'student@example.com',
      'Verify your account',
      '<p>Your code is 123456</p>',
    );

    expect(result.success).toBe(true);
    expect(result.providerRef).toBeDefined();
  });

  it('provider returns a failure/error status — resolves { success: false }, does not throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ error: 'invalid recipient' }),
      }),
    );

    await expect(send('student@example.com', 'subject', 'body')).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );
  });

  it('provider request times out or the network fails — resolves { success: false }, normalized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    await expect(send('student@example.com', 'subject', 'body')).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );
  });

  it('never logs or includes the raw API key in a thrown error / log line', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    await send('student@example.com', 'subject', 'body');

    const apiKey = process.env.BREVO_API_KEY as string;
    const loggedText = errorSpy.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(loggedText).not.toContain(apiKey);

    errorSpy.mockRestore();
  });

  it('the request target is the fixed Brevo base URL — never derived from user input', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ messageId: 'ref' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await send('attacker+http://evil.example@example.com', 'subject', 'body');

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl.startsWith(process.env.BREVO_BASE_URL as string)).toBe(true);
  });
});
