// src/utils/providers/sms.client.ts
import { env } from '../../config/env.js';

interface SendSmsResult {
  success: boolean;
  providerRef?: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Send an SMS via Geez SMS. Implements the shared NotificationProviderClient
 * contract from 8-1-shared-config.md §"src/utils/providers":
 *
 *   send(to, subjectOrTemplate, body) => Promise<{ success, providerRef? }>
 *
 * Never throws. Every failure path — network, timeout, non-2xx response,
 * unparseable body — resolves as `{ success: false }`. The caller
 * (notification.service.ts) is what writes a FAILED row for
 * notificationRetry.job.ts to pick up; retry policy is not this client's
 * concern.
 *
 * Security:
 *   A10:2021 SSRF — the outbound request target is composed exclusively
 *     from env.GEEZ_SMS_BASE_URL. Caller-supplied values (to /
 *     subjectOrTemplate / body) travel only in the POST body and cannot
 *     steer the host, path, or query of the outbound request.
 *   A02:2021 Cryptographic Failures — the API key appears only in the
 *     Authorization header. It is never interpolated into a log line,
 *     error message, thrown value, or returned object.
 */
export async function send(
  to: string,
  subjectOrTemplate: string,
  body: string,
): Promise<SendSmsResult> {
  // Fixed provider endpoint — see A10 above.
  const url = `${env.GEEZ_SMS_BASE_URL}/sms/send`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.GEEZ_SMS_API_KEY}`,
      },
      body: JSON.stringify({
        to,
        template: subjectOrTemplate,
        message: body,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { success: false };
    }

    const payload: unknown = await response.json();
    const providerRef =
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as { id?: unknown }).id === 'string'
        ? (payload as { id: string }).id
        : undefined;

    return providerRef === undefined ? { success: true } : { success: true, providerRef };
  } catch {
    // Network failure, DNS error, TLS error, or abort/timeout. Nothing is
    // logged — the resolved `{ success: false }` is the signal; the caller
    // records the failure against the Notification row. Keeping the catch
    // silent is the belt-and-braces half of the A02 guarantee: no request
    // detail (URL, headers, body) can reach a log sink from here.
    return { success: false };
  }
}
