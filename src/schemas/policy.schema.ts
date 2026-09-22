// src/schemas/policy.schema.ts
import { z } from 'zod';

/**
 * `:type` is a path param, not a body field — see the route tests
 * (`GET /api/v1/policies/NOT_A_REAL_TYPE` must 400 at the schema layer)
 * and the controller tests (`publishPolicy` reads `req.params.type`).
 * This differs from Doc 05a §1's `publishPolicySchema` shape, which put
 * `type` in the body; the tests are authoritative (working-context §2).
 */
const policyTypeSchema = z.enum(['PRIVACY', 'TERMS', 'SAFETY', 'REFUND', 'RULES']);

export const getPolicySchema = z.object({
  params: z.object({ type: policyTypeSchema }),
});

export const publishPolicySchema = z.object({
  params: z.object({ type: policyTypeSchema }),
  body: z.object({ content: z.string().min(1) }),
});
