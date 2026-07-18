import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../config/database';

type TaskAuthorizationClient = PrismaClient | Prisma.TransactionClient;

export async function canUserActOnTask(
  task: { caseId: string; assignedToId?: string | null; assignedById?: string | null },
  userId: string,
  db: TaskAuthorizationClient = prisma,
): Promise<{ allowed: boolean; role: string | null }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!user) return { allowed: false, role: null };

  if (['ADMIN', 'PARTNER'].includes(String(user.role))) {
    return { allowed: true, role: String(user.role) };
  }

  if (task.assignedToId === userId || task.assignedById === userId) {
    return { allowed: true, role: String(user.role) };
  }

  const caseRecord = await db.case.findUnique({
    where: { id: task.caseId },
    select: { assignedLawyerId: true, createdById: true },
  });
  if (caseRecord?.assignedLawyerId === userId || caseRecord?.createdById === userId) {
    return { allowed: true, role: String(user.role) };
  }

  const collaborator = await db.caseCollaborator.findFirst({
    where: { caseId: task.caseId, userId },
    select: { id: true },
  });
  return { allowed: Boolean(collaborator), role: String(user.role) };
}
