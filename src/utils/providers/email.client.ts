// src/utils/providers/email.client.ts
import { env } from '../../config/env.js';

interface SendEmailResult {
  success: boolean;
  providerRef?: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Send a transactional email via Brevo. Implements the shared
 * NotificationProviderClient contract from 8-1-shared-config.md
 * §"src/utils/providers":
 *
 *   send(to, subjectOrTemplate, body) => Promise<{ success, providerRef? }>
 *
 * Never throws. Every failure path — network, timeout, non-2xx response,
 * unparseable body — resolves as `{ success: false }`. The caller
 * (notification.service.ts) writes a FAILED row for
 * notificationRetry.job.ts to pick up; retry policy is not this client's
 * concern.
 *
 * Security:
 *   A10:2021 SSRF — the outbound request target is composed exclusively
 *     from env.BREVO_BASE_URL. Caller-supplied values (to /
 *     subjectOrTemplate / body) travel only in the POST body and cannot
 *     steer the host, path, or query of the outbound request — including
 *     a `to` value that embeds a URL like
 *     `attacker+http://evil.example@example.com`, which is treated as an
 *     opaque string and never parsed as a request target.
 *   A02:2021 Cryptographic Failures — the API key appears only in the
 *     `api-key` request header (Brevo's documented auth header, not
 *     Bearer). It is never interpolated into a log line, error message,
 *     thrown value, or returned object.
 */
export async function send(
  to: string,
  subjectOrTemplate: string,
  body: string,
): Promise<SendEmailResult> {
  // Fixed provider endpoint — see A10 above.
  const url = `${env.BREVO_BASE_URL}/smtp/email`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Brevo authenticates via a lowercase `api-key` header, not a
        // Bearer token — deliberately different from sms.client.ts.
        'api-key': env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { email: env.BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject: subjectOrTemplate,
        htmlContent: body,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { success: false };
    }

    const payload: unknown = await response.json();
    // Brevo returns `{ messageId }` on a successful send.
    const providerRef =
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as { messageId?: unknown }).messageId === 'string'
        ? (payload as { messageId: string }).messageId
        : undefined;

    return providerRef === undefined ? { success: true } : { success: true, providerRef };
  } catch {
    // Network failure, DNS error, TLS error, or abort/timeout. Nothing is
    // logged — the resolved `{ success: false }` is the signal, and the
    // caller records the failure against the Notification row. Keeping the
    // catch silent is the belt-and-braces half of the A02 guarantee: no
    // request detail (URL, headers, body) can reach a log sink from here.
    return { success: false };
  }
}
