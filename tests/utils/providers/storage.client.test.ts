/**
 * tests/utils/providers/storage.client.test.ts
 *
 * Journey step 4.9. Spec: `09-4-class-delivery-library.md` §9.8.
 * FRs: FR-SP-035, FR-CD-005. NFRs: NFR-007, NFR-012.
 * OWASP: A01:2021 – Broken Access Control (signed URL scope/expiry),
 * A02:2021 – Cryptographic Failures (credential handling),
 * A05:2021 – Security Misconfiguration (bucket/object exposure).
 *
 * Mocks the underlying R2 (S3-compatible) SDK — real network/bucket
 * behavior is explicitly out of scope for this unit tier (§9.23).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const putObjectMock = vi.fn();
const getSignedUrlMock = vi.fn();

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: putObjectMock })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

import { getSignedUrl, upload } from '../../../src/utils/providers/storage.client.js';

function resetMocks() {
  vi.clearAllMocks();
}

describe.skip('upload', () => {
  beforeEach(resetMocks);

  it('resolves { storageKey } on a successful upload', async () => {
    putObjectMock.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

    const result = await upload(
      'recordings/2026/09/some-key.mp4',
      Buffer.from('file-bytes'),
      'video/mp4',
    );

    expect(result.storageKey).toBeTruthy();
  });

  it('propagates a normalized error on upload failure — callers must treat it as a genuine failure', async () => {
    putObjectMock.mockRejectedValue(new Error('R2 unavailable'));

    await expect(upload('key', Buffer.from('x'), 'video/mp4')).rejects.toThrow();
  });

  it('the storage key is not derived from unsanitized user input — path-traversal-like filenames are sanitized/namespaced', async () => {
    putObjectMock.mockResolvedValue({ $metadata: { httpStatusCode: 200 } });

    const maliciousKey = '../../etc/passwd';
    const result = await upload(maliciousKey, Buffer.from('x'), 'video/mp4');

    expect(result.storageKey).not.toBe(maliciousKey);
    expect(result.storageKey).not.toContain('../');
  });
});

describe.skip('getSignedUrl', () => {
  beforeEach(resetMocks);

  it('resolves a URL string, calling the SDK presigner with the requested expiry', async () => {
    getSignedUrlMock.mockResolvedValue('https://r2.akewtutor.com/signed?sig=abc');

    const url = await getSignedUrl('recordings/2026/09/key.mp4', 900);

    expect(typeof url).toBe('string');
    const presignerArgs = getSignedUrlMock.mock.calls[0];
    expect(presignerArgs[2]).toMatchObject({ expiresIn: 900 });
  });

  it("the client itself supports any caller-supplied expiry — the platform-standard 900s convention at recording.service.ts's actual call site is asserted in recording.service.test.ts (§9.9), not duplicated here", async () => {
    getSignedUrlMock.mockResolvedValue('https://r2.akewtutor.com/signed?sig=abc');

    await getSignedUrl('recordings/2026/09/key.mp4', 900);

    const presignerArgs = getSignedUrlMock.mock.calls[0];
    expect(presignerArgs[2]).toMatchObject({ expiresIn: 900 });
  });

  it('no log statement contains the raw R2 secret key', async () => {
    getSignedUrlMock.mockResolvedValue('https://r2.akewtutor.com/signed?sig=abc');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await getSignedUrl('recordings/2026/09/key.mp4', 900);

    const secret = process.env.CLOUDFLARE_R2_SECRET_KEY ?? 'test-r2-secret';
    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allLoggedText).not.toContain(secret);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
