/**
 * tests/e2e/mock-servers/chapa.mock-server.ts
 *
 * Local mock HTTP server standing in for Chapa (10-e2e-specification.md
 * §10.1 item 3, first bullet): "a local mock server that accepts the real
 * checkout-initiation shape and can be told to deliver a signed webhook
 * callback (SUCCESS, FAILED, or a byte-identical replay) on demand."
 *
 * Runs as its own process/server — never vi.mock() (00-agent-rules.md
 * Rule 8). E2E specs point CHAPA_BASE_URL at this server instead of the
 * real Chapa sandbox.
 *
 * Not used until Phase 9 (E2E), but built now per journey step 0.2, so
 * every later phase can assume the harness already exists.
 */

import express, { type Express } from 'express';
import crypto from 'node:crypto';
import type { Server } from 'node:http';

export interface ChapaMockServer {
  app: Express;
  server: Server;
  port: number;
  /** Every /transaction/initialize call this server has received, in order. */
  initializations: Array<{ tx_ref: string; amount: string; body: Record<string, unknown> }>;
  /**
   * Delivers a signed webhook to `webhookUrl` for the given `tx_ref`, as if
   * Chapa itself had called back. Call twice with the same `tx_ref` to
   * exercise the mandatory idempotency case (Rule 9, 00-agent-rules.md).
   */
  deliverWebhook: (opts: {
    webhookUrl: string;
    tx_ref: string;
    status: 'success' | 'failed';
  }) => Promise<Response>;
}

const CHAPA_MOCK_SECRET = 'test-chapa-webhook-secret';

/** Same HMAC-SHA256-over-payload shape the real handleChapaWebhook must verify. */
function signPayload(payload: Record<string, unknown>): string {
  return crypto
    .createHmac('sha256', CHAPA_MOCK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

export async function startChapaMockServer(port = 4001): Promise<ChapaMockServer> {
  const app = express();
  app.use(express.json());

  const initializations: ChapaMockServer['initializations'] = [];

  // Mirrors Chapa's real POST /v1/transaction/initialize shape closely
  // enough for a checkout-initiation contract test: accepts amount,
  // currency, tx_ref, callback/return URLs; returns a checkout_url.
  app.post('/v1/transaction/initialize', (req, res) => {
    const { tx_ref, amount } = req.body ?? {};
    initializations.push({ tx_ref, amount, body: req.body });
    res.status(200).json({
      status: 'success',
      message: 'Hosted Link',
      data: { checkout_url: `http://localhost:${port}/checkout/${tx_ref}` },
    });
  });

  app.get('/checkout/:txRef', (req, res) => {
    res.status(200).send(`<html><body>Mock Chapa checkout for ${req.params.txRef}</body></html>`);
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(port, () => resolve(s));
  });

  return {
    app,
    server,
    port,
    initializations,
    async deliverWebhook({ webhookUrl, tx_ref, status }) {
      const payload = {
        event: status === 'success' ? 'charge.success' : 'charge.failed',
        tx_ref,
        status,
      };
      return fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Chapa-Signature': signPayload(payload),
        },
        body: JSON.stringify(payload),
      });
    },
  };
}

export async function stopChapaMockServer(instance: ChapaMockServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    instance.server.close((err) => (err ? reject(err) : resolve()));
  });
}
