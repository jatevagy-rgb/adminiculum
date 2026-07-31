/**
 * Client question threads (Phase 5). A customer asks a question on a granted
 * case; internal drafts stay hidden (visibility=DRAFT) until an explicit send
 * (visibility=SENT). Customer/case/identity are derived server-side from the
 * active grant. Sending an answer may transactionally enqueue a safe e-mail.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InteractionError, InternalActor, Prisma, CustomerContext,
  requireInternal, requireExpected, assertInternalCaseAccess, safeText, assertClientSafe,
} from './base';
import { requireCapability, isCapabilityEnabled } from './gates';
import { enqueueNotification } from './notificationService';

function toClientSafeThread(thread: any, messages: any[]) {
  const dto = {
    id: thread.id,
    caseId: thread.caseId,
    subject: thread.subject,
    status: thread.status,
    createdAt: thread.createdAt,
    messages: messages
      .filter((m) => m.visibility === 'SENT')
      .map((m) => ({ id: m.id, authorType: m.authorType, body: m.bodySafe, sentAt: m.sentAt || m.createdAt })),
  };
  assertClientSafe(dto);
  return dto;
}

// ---- Customer side
export async function createCustomerQuestion(ctx: CustomerContext, input: { subject?: unknown; bodySafe?: unknown }, prisma: Prisma = defaultPrisma) {
  requireCapability('QUESTIONS');
  const subject = safeText(input.subject, 'subject', 200, true)!;
  const body = safeText(input.bodySafe, 'bodySafe', 4000, true)!;
  const thread = await prisma.$transaction(async (tx) => {
    const t = await tx.clientQuestionThread.create({
      data: { clientId: ctx.clientId, caseId: ctx.caseId, clientPortalIdentityId: ctx.clientPortalIdentityId, subject, status: 'OPEN' },
    });
    await tx.clientQuestionMessage.create({
      data: { threadId: t.id, authorType: 'CLIENT', clientPortalIdentityId: ctx.clientPortalIdentityId, bodySafe: body, visibility: 'SENT', sentAt: new Date() },
    });
    return t;
  });
  const messages = await prisma.clientQuestionMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'asc' } });
  return toClientSafeThread(thread, messages);
}

export async function listCustomerThreads(ctx: CustomerContext, prisma: Prisma = defaultPrisma) {
  const threads = await prisma.clientQuestionThread.findMany({
    where: { caseId: ctx.caseId, clientPortalIdentityId: ctx.clientPortalIdentityId },
    orderBy: { updatedAt: 'desc' },
  });
  return { items: threads.map((t) => ({ id: t.id, subject: t.subject, status: t.status, updatedAt: t.updatedAt })) };
}

export async function getCustomerThread(ctx: CustomerContext, threadId: string, prisma: Prisma = defaultPrisma) {
  const thread = await prisma.clientQuestionThread.findFirst({ where: { id: threadId, caseId: ctx.caseId, clientPortalIdentityId: ctx.clientPortalIdentityId } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Question thread is not available.');
  const messages = await prisma.clientQuestionMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } });
  return toClientSafeThread(thread, messages);
}

// ---- Internal side
export async function listThreadsInternal(actor: InternalActor, filter: { caseId?: string; status?: string; limit?: number; offset?: number }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const where: any = {};
  if (filter.caseId) { await assertInternalCaseAccess(actor, filter.caseId, prisma); where.caseId = filter.caseId; }
  if (filter.status) where.status = filter.status;
  const limit = Math.min(Math.max(1, filter.limit ?? 50), 200);
  const offset = Math.max(0, filter.offset ?? 0);
  const [items, total] = await Promise.all([
    prisma.clientQuestionThread.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: offset, take: limit }),
    prisma.clientQuestionThread.count({ where }),
  ]);
  return { items, total, limit, offset };
}

export async function getThreadInternal(actor: InternalActor, threadId: string, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const thread = await prisma.clientQuestionThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Thread not found.');
  await assertInternalCaseAccess(actor, thread.caseId, prisma);
  const messages = await prisma.clientQuestionMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' } });
  return { thread, messages };
}

/** Internal draft answer — hidden from the customer until sent. */
export async function draftAnswer(actor: InternalActor, threadId: string, input: { bodySafe?: unknown }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const thread = await prisma.clientQuestionThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Thread not found.');
  await assertInternalCaseAccess(actor, thread.caseId, prisma);
  const body = safeText(input.bodySafe, 'bodySafe', 8000, true)!;
  const message = await prisma.clientQuestionMessage.create({
    data: { threadId, authorType: 'INTERNAL', internalUserId: actor.userId, bodySafe: body, visibility: 'DRAFT' },
  });
  await prisma.clientQuestionThread.update({ where: { id: threadId }, data: { status: 'INTERNAL_REVIEW', assignedInternalUserId: actor.userId } });
  return message;
}

/** Explicitly send a drafted internal answer; optionally enqueue a safe e-mail. */
export async function sendAnswer(actor: InternalActor, threadId: string, messageId: string, input: { sendNotification?: boolean }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const thread = await prisma.clientQuestionThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Thread not found.');
  await assertInternalCaseAccess(actor, thread.caseId, prisma);
  const message = await prisma.clientQuestionMessage.findFirst({ where: { id: messageId, threadId, authorType: 'INTERNAL', visibility: 'DRAFT' } });
  if (!message) throw new InteractionError(404, 'DRAFT_ANSWER_NOT_FOUND', 'No draft answer to send.');

  await prisma.$transaction(async (tx) => {
    await tx.clientQuestionMessage.update({ where: { id: messageId }, data: { visibility: 'SENT', sentAt: new Date() } });
    await tx.clientQuestionThread.update({ where: { id: threadId }, data: { status: 'ANSWERED' } });
    if (input.sendNotification && isCapabilityEnabled('EMAIL_NOTIFICATIONS')) {
      const identity = await tx.clientPortalIdentity.findUnique({ where: { id: thread.clientPortalIdentityId }, select: { normalizedEmail: true, displayName: true } });
      if (identity?.normalizedEmail) {
        await enqueueNotification({
          eventType: 'QUESTION_ANSWERED', clientId: thread.clientId, caseId: thread.caseId,
          recipientEmail: identity.normalizedEmail, recipientName: identity.displayName,
          subjectSafe: 'Új válasz az Adminiculum ügyfélportálon', createdById: actor.userId,
          idempotencyKey: `question-answer:${messageId}`,
        }, tx);
      }
    }
  });
  return { sent: true };
}

export async function closeThread(actor: InternalActor, threadId: string, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const thread = await prisma.clientQuestionThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Thread not found.');
  await assertInternalCaseAccess(actor, thread.caseId, prisma);
  return prisma.clientQuestionThread.update({ where: { id: threadId }, data: { status: 'CLOSED', revision: { increment: 1 } } });
}
