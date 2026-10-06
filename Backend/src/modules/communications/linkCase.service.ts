import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { isWorkforceRole } from '../../middleware/workforceAuthorization';
import { buildCaseReadScope } from '../cases/authorization';
import { userCanReadMailboxCommunication } from './readScope';

export class CommunicationLinkError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Link once. Repeating the same link is safe; moving a linked message is not this operation. */
export async function linkCommunicationToCase(
  communicationId: string, caseId: string, actor: { userId: string; role: string }, db: PrismaClient = prisma,
) {
  if (!actor.userId || !isWorkforceRole(actor.role)) {
    throw new CommunicationLinkError(403, 'COMMUNICATION_ACCESS_FORBIDDEN', 'Ehhez az üzenethez nincs hozzáférése.');
  }
  return db.$transaction(async (tx) => {
    // Keep the target client stable and serialize all links of this message.
    await tx.$queryRaw`SELECT id FROM cases WHERE id=${caseId} FOR UPDATE`;
    const scope = buildCaseReadScope(actor.userId, actor.role);
    const target = await tx.case.findFirst({ where: { id: caseId, ...(scope ? { AND: [scope] } : {}) }, select: { id: true, clientId: true } });
    if (!target) throw new CommunicationLinkError(403, 'CASE_ACCESS_FORBIDDEN', 'A kiválasztott ügy nem érhető el.');
    await tx.$queryRaw`SELECT id FROM communications WHERE id=${communicationId} FOR UPDATE`;
    const current = await tx.communication.findUnique({ where: { id: communicationId } });
    if (!current) throw new CommunicationLinkError(404, 'COMMUNICATION_NOT_FOUND', 'Az üzenet nem található.');
    const privileged = actor.role === 'ADMIN' || actor.role === 'PARTNER';
    const readableCase = current.caseId ? await tx.case.findFirst({ where: { id: current.caseId, ...(scope ? { AND: [scope] } : {}) }, select: { id: true } }) : null;
    if (!(await userCanReadMailboxCommunication(actor.userId, current, tx)) ||
        (current.caseId ? !readableCase : !privileged && current.createdById !== actor.userId)) {
      throw new CommunicationLinkError(403, 'COMMUNICATION_ACCESS_FORBIDDEN', 'Ehhez az üzenethez nincs hozzáférése.');
    }
    if (current.clientId && current.clientId !== target.clientId) {
      throw new CommunicationLinkError(409, 'CLIENT_CASE_MISMATCH', 'Az üzenet és az ügy másik ügyfélhez tartozik.');
    }
    if (current.caseId === target.id) return { success: true, communication: current, message: 'Az üzenet már ehhez az ügyhöz tartozik.' };
    if (current.caseId) throw new CommunicationLinkError(409, 'COMMUNICATION_ALREADY_LINKED', 'Az üzenetet időközben másik ügyhöz kapcsolták. Frissítse a listát.');
    const conflictingTask = await tx.task.findFirst({ where: { sourceCommunicationId: current.id, caseId: { not: target.id } }, select: { id: true } });
    if (conflictingTask) throw new CommunicationLinkError(409, 'COMMUNICATION_TASK_CASE_MISMATCH', 'Az üzenetből létrehozott feladat másik ügyhöz tartozik.');
    const changed = await tx.communication.updateMany({
      where: { id: current.id, caseId: null, clientId: current.clientId },
      data: { caseId: target.id, clientId: target.clientId },
    });
    if (changed.count !== 1) throw new CommunicationLinkError(409, 'COMMUNICATION_ALREADY_LINKED', 'Az üzenet kapcsolata megváltozott. Frissítse a listát.');
    await tx.timelineEvent.create({ data: {
      caseId: target.id, userId: actor.userId, eventType: 'CLIENT_CONTACT', type: 'CLIENT_CONTACT',
      payload: { communicationId: current.id, subject: current.subject, action: 'linked_to_case', previousCaseId: null },
    } });
    return { success: true, communication: { ...current, caseId: target.id, clientId: target.clientId }, message: 'Az üzenetet az ügyhöz kapcsoltuk.' };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}
