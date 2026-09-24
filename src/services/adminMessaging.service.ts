import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';

export async function viewThreadForDispute(threadId: string, page: number, limit: number) {
  const thread = await prisma.messageThread.findUnique({ where: { id: threadId } });
  if (!thread) {
    throw new ApiError(404, 'Thread not found');
  }

  const skip = (page - 1) * limit;
  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    }),
    prisma.message.count({ where: { threadId } }),
  ]);

  return { ...thread, messages, page, limit, total };
}

export async function closeThread(threadId: string, adminId: string, reason: string) {
  const thread = await prisma.messageThread.findUnique({ where: { id: threadId } });
  if (!thread) {
    throw new ApiError(404, 'Thread not found');
  }

  return prisma.messageThread.update({
    where: { id: threadId },
    data: {
      status: 'CLOSED_BY_ADMIN',
      closedById: adminId,
      closedAt: new Date(),
    },
  });
}
