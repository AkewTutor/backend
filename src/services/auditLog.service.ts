// src/services/auditLog.service.ts
import { prisma } from '../config/db.js';

export interface AuditLogEntryInput {
  actor: string;
  action: string;
  target: string;
  timestamp: Date;
}

/**
 * Append-only audit log writer.
 *
 * Per working-context Rule 6, every endpoint touching money,
 * guardian/student PII, or an admin trust action (refund approve/reject,
 * account suspend, tutor verify/reject, policy publish, dispute resolve,
 * relationship revoke, etc.) records an entry here. The pinned call
 * shape — asserted against in the consumer services' tests — is:
 *
 *   record({ actor, action, target, timestamp })
 *
 * Export shape note: the mirrored consumer test (`auth.service.test.ts`)
 * mocks this module as `{ record: vi.fn() }` and imports `{ record }`
 * directly, so the exported binding is a plain named function, not
 * `service.record` or a nested object. Rule 1 — the test is the spec.
 *
 * Rows are insert-only. Nothing in this module updates or deletes an
 * existing entry — see Doc 04 §4.2.10 ("append-only record ... for
 * compliance and dispute review").
 *
 * Failure semantics: `record` throws on failure rather than swallowing.
 * Audit entries are compliance-critical; a silent failure would defeat
 * their purpose. Callers that need atomicity with a mutation should run
 * both inside the same `prisma.$transaction` and let a rejection roll
 * back the mutation. This is deliberately the opposite of
 * `notification.service.dispatchNotification`, which must never throw
 * back into its caller.
 */
export async function record(entry: AuditLogEntryInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      timestamp: entry.timestamp,
    },
  });
}
