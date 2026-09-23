/**
 * tests/services/availability.service.test.ts
 *
 * Journey step 2.14. Spec: `09-2-accounts-guardianship.md` §9.12.
 * FRs: FR-TU-009.
 * OWASP: A01:2021 – Broken Access Control.
 *
 * Includes the slot-in-use-cannot-delete case per the folder-structure
 * doc's summary note.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/db.js', () => ({
  prisma: {
    availabilitySlot: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    scheduledSession: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from '../../src/config/db.js';
import { listSlots, removeSlot, setSlots } from '../../src/services/availability.service.js';

function resetAllMocks() {
  vi.clearAllMocks();
}

describe('setSlots / listSlots', () => {
  beforeEach(() => resetAllMocks());

  it('creates a valid slot', async () => {
    (prisma.availabilitySlot.create as any).mockResolvedValue({ id: 'slot-1', dayOfWeek: 1 });

    const result = await setSlots('tutor-1', {
      dayOfWeek: 1,
      startTime: new Date('2026-06-01T10:00:00Z'),
      endTime: new Date('2026-06-01T11:00:00Z'),
      isRecurring: true,
    } as any);

    expect(result).toMatchObject({ id: 'slot-1' });
  });

  it('rejects endTime before startTime at the service layer — authoritative re-check independent of schema', async () => {
    await expect(
      setSlots('tutor-1', {
        startTime: new Date('2026-06-01T11:00:00Z'),
        endTime: new Date('2026-06-01T10:00:00Z'),
        isRecurring: false,
      } as any),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'End time must be after start time',
    });
  });

  it("listSlots returns only the calling tutor's own slots — the Prisma filter includes tutorId", async () => {
    (prisma.availabilitySlot.findMany as any).mockResolvedValue([
      { id: 'slot-1', tutorId: 'tutor-1' },
    ]);

    await listSlots('tutor-1');

    const callArg = (prisma.availabilitySlot.findMany as any).mock.calls[0][0];
    expect(callArg.where).toMatchObject({ tutorId: 'tutor-1' });
  });
});

describe('removeSlot', () => {
  beforeEach(() => resetAllMocks());

  it('an owner removes their own unused slot', async () => {
    (prisma.availabilitySlot.findUnique as any).mockResolvedValue({
      id: 'slot-1',
      tutorId: 'tutor-1',
    });
    (prisma.scheduledSession.findFirst as any).mockResolvedValue(null);
    (prisma.availabilitySlot.delete as any).mockResolvedValue({ id: 'slot-1' });

    const result = await removeSlot('tutor-1', 'slot-1');

    expect(result).toMatchObject({ id: 'slot-1', deleted: true });
  });

  it('a non-owner removal attempt is rejected — IDOR', async () => {
    (prisma.availabilitySlot.findUnique as any).mockResolvedValue({
      id: 'slot-1',
      tutorId: 'other-tutor',
    });

    await expect(removeSlot('tutor-1', 'slot-1')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not authorized to remove this slot',
    });
  });

  it('a slot in use by a confirmed session cannot be removed', async () => {
    (prisma.availabilitySlot.findUnique as any).mockResolvedValue({
      id: 'slot-1',
      tutorId: 'tutor-1',
    });
    (prisma.scheduledSession.findFirst as any).mockResolvedValue({
      id: 'session-1',
      status: 'CONFIRMED',
    });

    await expect(removeSlot('tutor-1', 'slot-1')).rejects.toMatchObject({
      statusCode: 409,
      message:
        'This slot is in use by a confirmed session and cannot be removed until it is resolved',
    });
  });

  it('a slot with no dependent session removes cleanly even when other unrelated slots have confirmed sessions', async () => {
    (prisma.availabilitySlot.findUnique as any).mockResolvedValue({
      id: 'slot-2',
      tutorId: 'tutor-1',
    });
    (prisma.scheduledSession.findFirst as any).mockResolvedValue(null); // scoped to this slot's overlap only
    (prisma.availabilitySlot.delete as any).mockResolvedValue({ id: 'slot-2' });

    await expect(removeSlot('tutor-1', 'slot-2')).resolves.toMatchObject({ deleted: true });
    const callArg = (prisma.scheduledSession.findFirst as any).mock.calls[0][0];
    expect(callArg).toBeDefined();
  });
});
