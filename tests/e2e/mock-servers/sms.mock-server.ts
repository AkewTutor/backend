/**
 * tests/e2e/mock-servers/sms.mock-server.ts
 *
 * Local mock HTTP server standing in for Geez SMS (10-e2e-specification.md
 * §10.1 item 3, second bullet): "a local mock server capturing the outbound
 * payload so a test can assert on what was actually sent, not just that
 * dispatchNotification was called."
 *
 * Matches the shared `NotificationProviderClient` shape
 * (08-function-level-specification/backend/8-1-shared-config.md, "new"
 * src/utils/providers section): `send(to, subjectOrTemplate, body)`.
 */

import express, { type Express } from 'express';
import type { Server } from 'node:http';

export interface CapturedSms {
  to: string;
  templateOrSubject: string;
  body: string;
  receivedAt: Date;
}

export interface SmsMockServer {
  app: Express;
  server: Server;
  port: number;
  /** Every SMS this server has received, in order. Read directly, or via GET /__test__/messages. */
  messages: CapturedSms[];
}

export async function startSmsMockServer(port = 4002): Promise<SmsMockServer> {
  const app = express();
  app.use(express.json());

  const messages: CapturedSms[] = [];

  // Mirrors Geez SMS's real send-message endpoint shape closely enough for
  // a contract test: accepts recipient + template/subject + body.
  app.post('/v1/send', (req, res) => {
    const { to, template, body } = req.body ?? {};
    const captured: CapturedSms = { to, templateOrSubject: template, body, receivedAt: new Date() };
    messages.push(captured);
    res.status(200).json({ success: true, providerRef: `mock-sms-${messages.length}` });
  });

  app.get('/__test__/messages', (_req, res) => {
    res.status(200).json(messages);
  });

  app.post('/__test__/reset', (_req, res) => {
    messages.length = 0;
    res.status(204).send();
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });

  return { app, server, port, messages };
}

export async function stopSmsMockServer(instance: SmsMockServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    instance.server.close((err) => (err ? reject(err) : resolve()));
  });
}
