/**
 * tests/e2e/mock-servers/index.ts
 *
 * Combined harness for the three local mock HTTP servers
 * (10-e2e-specification.md §10.1 item 3): Chapa, Geez SMS, Brevo. Started
 * once per Playwright run via globalSetup.ts, stopped via globalTeardown.ts.
 * Individual E2E specs that need to assert on captured payloads or trigger
 * a webhook re-import the specific mock server module directly (e.g.
 * `import { startChapaMockServer } from './chapa.mock-server.js'`) against
 * the already-running instance's port.
 */

import {
  startChapaMockServer,
  stopChapaMockServer,
  type ChapaMockServer,
} from './chapa.mock-server.js';
import { startSmsMockServer, stopSmsMockServer, type SmsMockServer } from './sms.mock-server.js';
import {
  startEmailMockServer,
  stopEmailMockServer,
  type EmailMockServer,
} from './email.mock-server.js';

export interface MockServerHarness {
  chapa: ChapaMockServer;
  sms: SmsMockServer;
  email: EmailMockServer;
}

/** Ports match the CHAPA_BASE_URL / GEEZ_SMS_BASE_URL / BREVO_BASE_URL values in .env.test. */
export async function startMockServerHarness(): Promise<MockServerHarness> {
  const [chapa, sms, email] = await Promise.all([
    startChapaMockServer(4001),
    startSmsMockServer(4002),
    startEmailMockServer(4003),
  ]);
  return { chapa, sms, email };
}

export async function stopMockServerHarness(harness: MockServerHarness): Promise<void> {
  await Promise.all([
    stopChapaMockServer(harness.chapa),
    stopSmsMockServer(harness.sms),
    stopEmailMockServer(harness.email),
  ]);
}
