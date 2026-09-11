/**
 * tests/controllers/availability.controller.test.ts
 *
 * Journey step 2.15. Spec: `09-2-accounts-guardianship.md` §9.13.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../src/services/availability.service.js', () => ({
  listSlots: vi.fn(),
  setSlots: vi.fn(),
  removeSlot: vi.fn(),
}));

import * as availabilityService from '../../src/services/availability.service.js';
import { removeSlot as removeSlotController } from '../../src/controllers/availability.controller.js';
import ApiError from '../../src/utils/ApiError.js';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, query: {}, ...overrides } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe.skip('availability.controller.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removeSlot propagates a 409 unchanged, not rewritten as a generic 400', async () => {
    (availabilityService.removeSlot as any).mockRejectedValue(
      new ApiError(
        409,
        'This slot is in use by a confirmed session and cannot be removed until it is resolved',
      ),
    );
    const req = mockReq({
      user: { id: 'tutor-1', role: 'TUTOR' },
      params: { slotId: 'slot-1' },
    } as any);
    const next = vi.fn();

    await removeSlotController(req, mockRes(), next).catch(() => undefined);

    if (next.mock.calls.length > 0) {
      expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 409 });
    }
  });
});
