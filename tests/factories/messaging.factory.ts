/**
 * tests/factories/messaging.factory.ts
 *
 * Owns: MessageThread, Message
 * Ref: 00-test-fixtures.md §2 "messaging"
 *
 * Phase 0, step 0.7 of AKEWTutor-Backend-Test-Implementation-Journey.md.
 */

import { freshId, now, withOverrides } from './_helpers.js';
import type { Message, MessageThread } from './types.js';

/** Required override: `cohortId`. `status` defaults `ACTIVE`. */
export function buildMessageThread(
  overrides: Partial<MessageThread> & { cohortId: string },
): MessageThread {
  const base: MessageThread = {
    id: freshId(),
    cohortId: overrides.cohortId,
    status: 'ACTIVE',
    archivedAt: null,
    closedById: null,
    closedAt: null,
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}

/** Required overrides: `threadId`, `senderId`. `body` a placeholder string. */
export function buildMessage(
  overrides: Partial<Message> & { threadId: string; senderId: string },
): Message {
  const base: Message = {
    id: freshId(),
    threadId: overrides.threadId,
    senderId: overrides.senderId,
    body: 'Fixture message body.',
    createdAt: now(),
  };
  return withOverrides(base, overrides);
}
