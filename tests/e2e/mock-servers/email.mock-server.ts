/**
 * tests/e2e/mock-servers/email.mock-server.ts
 *
 * Local mock HTTP server standing in for Brevo (10-e2e-specification.md
 * §10.1 item 3, second bullet — Geez SMS / Brevo share the same convention:
 * a local mock server capturing the outbound payload).
 *
 * Matches the shared `NotificationProviderClient` shape
 * (08-function-level-specification/backend/8-1-shared-config.md):
 * `send(to, subjectOrTemplate, body)`.
 */

import express, { type Express } from 'express';
import type { Server } from 'node:http';

export interface CapturedEmail {
  to: string;
  subject: string;
  body: string;
  receivedAt: Date;
}

export interface EmailMockServer {
  app: Express;
  server: Server;
  port: number;
  /** Every email this server has received, in order. Read directly, or via GET /__test__/emails. */
  emails: CapturedEmail[];
}

export async function startEmailMockServer(port = 4003): Promise<EmailMockServer> {
  const app = express();
  app.use(express.json());

  const emails: CapturedEmail[] = [];

  // Mirrors Brevo's real transactional-email send endpoint shape closely
  // enough for a contract test: accepts recipient + subject + body.
  app.post('/v3/smtp/email', (req, res) => {
    const { to, subject, htmlContent } = req.body ?? {};
    const recipient = Array.isArray(to) ? to[0]?.email : to;
    const captured: CapturedEmail = {
      to: recipient,
      subject,
      body: htmlContent,
      receivedAt: new Date(),
    };
    emails.push(captured);
    res.status(201).json({ messageId: `mock-email-${emails.length}` });
  });

  app.get('/__test__/emails', (_req, res) => {
    res.status(200).json(emails);
  });

  app.post('/__test__/reset', (_req, res) => {
    emails.length = 0;
    res.status(204).send();
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });

  return { app, server, port, emails };
}

export async function stopEmailMockServer(instance: EmailMockServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    instance.server.close((err) => (err ? reject(err) : resolve()));
  });
}
