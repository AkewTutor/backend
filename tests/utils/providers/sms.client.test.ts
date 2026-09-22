/**
 * tests/utils/providers/sms.client.test.ts
 *
 * Journey step 1.9. Spec: `09-1-shared-config.md` §9.11.
 * OWASP: A10:2021 – Server-Side Request Forgery, A02:2021 – Cryptographic Failures.
 *
 * `smsClient.send(to, subjectOrTemplate, body)` implements the shared
 * `NotificationProviderClient` contract (`8-1-shared-config.md` §"src/utils/providers").
 * The underlying HTTP call (global `fetch`, per this template's dependency
 * set — no axios in package.json) is mocked; nothing here dials the real
 * Geez SMS sandbox.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { send } from '../../../src/utils/providers/sms.client.js';

describe('sms.client.ts — send', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('successful send resolves { success: true, providerRef }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'geez-ref-123' }),
      }),
    );

    const result = await send('+251911000000', 'VERIFY_CODE', 'Your code is 123456');

    expect(result.success).toBe(true);
    expect(result.providerRef).toBeDefined();
  });

  it('provider returns a failure/error status — resolves { success: false }, does not throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid destination' }),
      }),
    );

    await expect(send('+251911000000', 'VERIFY_CODE', 'body')).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );
  });

  it('provider request times out or the network fails — resolves { success: false }, normalized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network timeout')));

    await expect(send('+251911000000', 'VERIFY_CODE', 'body')).resolves.toEqual(
      expect.objectContaining({ success: false }),
    );
  });

  it('never logs or includes the raw API key in a thrown error / log line', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    await send('+251911000000', 'VERIFY_CODE', 'body');

    const apiKey = process.env.GEEZ_SMS_API_KEY as string;
    const loggedText = errorSpy.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(loggedText).not.toContain(apiKey);

    errorSpy.mockRestore();
  });

  it('the request target is the fixed Geez SMS base URL — never derived from user input', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'ref' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await send('http://attacker.example/steal?to=', 'subject', 'body');

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl.startsWith(process.env.GEEZ_SMS_BASE_URL as string)).toBe(true);
  });
});
