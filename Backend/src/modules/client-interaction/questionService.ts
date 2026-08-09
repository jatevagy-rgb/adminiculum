/**
 * Participant-scoped external Case communication.
 *
 * ClientQuestionThread + ClientQuestionMessage is the canonical customer-safe
 * message domain. Internal drafts stay hidden until explicit send, while every
 * customer read/write checks workspace membership, exact Case grant,
 * communication mode, grant permissions and active thread participation.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InteractionError, InternalActor, Prisma, CustomerContext,
  requireInternal, assertInternalCaseAccess, applyInternalQueueCaseScope, safeText, assertClientSafe,
} from './base';
import { requireCapability, isCapabilityEnabled } from './gates';
import { enqueueNotification } from './notificationService';
import { resolveParticipantAccess, requirePermission } from '../client-workspace/organizationalAccessPolicy';

type Row = Record<string, any>;

const CATEGORIES = new Set(['GENERAL', 'DOCUMENT_REQUEST', 'QUESTION', 'DECISION_REQUIRED', 'FEEDBACK_REQUIRED', 'DELIVERY', 'BILLING_QUESTION']);
const PUBLIC_MESSAGE_VISIBILITY = 'SENT';

function category(value: unknown): string {
  const output = String(value || 'QUESTION').trim().toUpperCase();
  if (!CATEGORIES.has(output)) throw new InteractionError(400, 'THREAD_CATEGORY_INVALID', 'Thread category is not supported.');
  return output;
}

async function requirePortalCommunication(ctx: CustomerContext, prisma: Prisma): Promise<void> {
  const workspace = await prisma.clientPortalWorkspace.findFirst({
    where: { id: ctx.workspaceId, clientId: ctx.clientId, status: 'ACTIVE' },
    select: { communicationMode: true },
  });
  if (!workspace) throw new InteractionError(403, 'CLIENT_WORKSPACE_MEMBERSHIP_REQUIRED', 'Active workspace is required.');
  if (String(workspace.communicationMode) === 'EXTERNAL_ONLY') {
    throw new InteractionError(403, 'CLIENT_PORTAL_MESSAGES_EXTERNAL_ONLY', 'Portal messages are handled in the connected external system.');
  }
}

async function customerParticipant(ctx: CustomerContext, threadId: string, prisma: Prisma): Promise<Row> {
  const row = await prisma.clientQuestionThreadParticipant.findFirst({
    where: { threadId, workspaceMembershipId: ctx.membershipId, removedAt: null, canRead: true },
    select: { id: true, canRead: true, canWrite: true, workspaceMembershipId: true },
  });
  if (!row) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Question thread is not available.');
  return row;
}

async function visibleMessages(threadId: string, prisma: Prisma): Promise<Row[]> {
  return prisma.clientQuestionMessage.findMany({
    where: { threadId, visibility: PUBLIC_MESSAGE_VISIBILITY },
    orderBy: { createdAt: 'asc' },
    include: { attachments: true },
  });
}

function toAttachmentDto(attachment: Row): Row {
  return {
    id: attachment.id,
    title: attachment.clientFacingTitle,
  };
}

function toMessageDto(message: Row): Row {
  return {
    id: message.id,
    authorType: message.authorType,
    body: message.bodySafe,
    sentAt: message.sentAt || message.createdAt,
    attachments: (message.attachments || []).map(toAttachmentDto),
  };
}

function toThreadDto(thread: Row, messages: Row[], unreadCount = 0): Row {
  const last = messages[messages.length - 1] || null;
  const dto = {
    id: thread.id,
    caseId: thread.caseId,
    category: thread.category || 'QUESTION',
    subject: thread.subject,
    status: thread.status,
    closed: thread.status === 'CLOSED',
    archived: Boolean(thread.archivedAt),
    lastMessageAt: thread.lastMessageAt || last?.sentAt || last?.createdAt || thread.updatedAt,
    unreadCount,
    messages: messages.map(toMessageDto),
  };
  assertClientSafe(dto);
  return dto;
}

async function unreadFor(threadId: string, membershipId: string, prisma: Prisma): Promise<number> {
  const readState = await prisma.clientQuestionThreadReadState.findUnique({
    where: { threadId_workspaceMembershipId: { threadId, workspaceMembershipId: membershipId } },
    select: { lastReadAt: true },
  });
  return prisma.clientQuestionMessage.count({
    where: {
      threadId,
      visibility: PUBLIC_MESSAGE_VISIBILITY,
      createdAt: readState?.lastReadAt ? { gt: readState.lastReadAt } : undefined,
    },
  });
}

async function assertCleanSubmissionFiles(ctx: CustomerContext, fileIds: unknown, prisma: Prisma): Promise<string[]> {
  const ids = Array.isArray(fileIds) ? [...new Set(fileIds.map((value) => String(value).trim()).filter(Boolean))] : [];
  if (!ids.length) return [];
  const rows = await prisma.clientSubmissionFile.findMany({
    where: {
      id: { in: ids },
      status: 'CLEAN',
      submission: { clientPortalIdentityId: ctx.clientPortalIdentityId, caseId: ctx.caseId, clientId: ctx.clientId },
    },
    select: { id: true },
  });
  if (rows.length !== ids.length) throw new InteractionError(403, 'MESSAGE_ATTACHMENT_NOT_AUTHORIZED', 'Attachment is not available for portal messaging.');
  return ids;
}

// ---- Customer side
export async function createCustomerQuestion(ctx: CustomerContext, input: { subject?: unknown; bodySafe?: unknown; category?: unknown; submissionFileIds?: unknown }, prisma: Prisma = defaultPrisma) {
  requireCapability('QUESTIONS');
  await requirePortalCommunication(ctx, prisma);
  const access = await resolveParticipantAccess(ctx.clientPortalIdentityId, ctx.caseId, ctx.workspaceId, prisma);
  requirePermission(access, 'canSendMessages', 'CLIENT_MESSAGES_SEND_DENIED');
  const subject = safeText(input.subject, 'subject', 200, true)!;
  const body = safeText(input.bodySafe, 'bodySafe', 4000, true)!;
  const fileIds = await assertCleanSubmissionFiles(ctx, input.submissionFileIds, prisma);
  const thread = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const t = await tx.clientQuestionThread.create({
      data: {
        clientId: ctx.clientId,
        caseId: ctx.caseId,
        clientPortalIdentityId: ctx.clientPortalIdentityId,
        workspaceId: ctx.workspaceId,
        createdByMembershipId: ctx.membershipId,
        category: category(input.category) as never,
        subject,
        status: 'OPEN',
        lastMessageAt: now,
      },
    });
    await tx.clientQuestionThreadParticipant.create({
      data: { threadId: t.id, workspaceMembershipId: ctx.membershipId, participantRole: (ctx.participantRole || 'PARTICIPANT') as never, canRead: true, canWrite: true },
    });
    const message = await tx.clientQuestionMessage.create({
      data: { threadId: t.id, authorType: 'CLIENT', clientPortalIdentityId: ctx.clientPortalIdentityId, bodySafe: body, visibility: PUBLIC_MESSAGE_VISIBILITY, sentAt: now },
    });
    for (const fileId of fileIds) {
      await tx.clientQuestionMessageAttachment.create({ data: { messageId: message.id, submissionFileId: fileId, clientFacingTitle: 'Csatolmány' } });
    }
    await tx.clientQuestionThreadReadState.upsert({
      where: { threadId_workspaceMembershipId: { threadId: t.id, workspaceMembershipId: ctx.membershipId } },
      create: { threadId: t.id, workspaceMembershipId: ctx.membershipId, lastReadMessageId: message.id, lastReadAt: now },
      update: { lastReadMessageId: message.id, lastReadAt: now },
    });
    return t;
  });
  return getCustomerThread(ctx, thread.id, prisma);
}

export async function listCustomerThreads(ctx: CustomerContext, prisma: Prisma = defaultPrisma, paging: { limit?: number; offset?: number } = {}) {
  await requirePortalCommunication(ctx, prisma);
  const access = await resolveParticipantAccess(ctx.clientPortalIdentityId, ctx.caseId, ctx.workspaceId, prisma);
  requirePermission(access, 'canViewMessages', 'CLIENT_MESSAGES_READ_DENIED');
  const limit = Math.min(Math.max(1, paging.limit ?? 50), 100);
  const offset = Math.max(0, paging.offset ?? 0);
  const where = {
    caseId: ctx.caseId,
    workspaceId: ctx.workspaceId,
    participants: { some: { workspaceMembershipId: ctx.membershipId, removedAt: null, canRead: true } },
  };
  const [threads, total] = await Promise.all([
    prisma.clientQuestionThread.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: offset, take: limit }),
    prisma.clientQuestionThread.count({ where }),
  ]);
  const items: Row[] = await Promise.all(threads.map(async (thread) => {
    const messages = await visibleMessages(thread.id, prisma);
    const dto = toThreadDto(thread, messages.slice(-1), await unreadFor(thread.id, ctx.membershipId, prisma));
    return { ...dto, messages: undefined, lastMessagePreview: messages.at(-1)?.bodySafe?.slice(0, 160) || null };
  }));
  const unreadMessages = items.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0);
  return { items, total, limit, offset, unreadThreads: items.filter((item) => Number(item.unreadCount || 0) > 0).length, unreadMessages };
}

export async function getCustomerThread(ctx: CustomerContext, threadId: string, prisma: Prisma = defaultPrisma) {
  await requirePortalCommunication(ctx, prisma);
  const access = await resolveParticipantAccess(ctx.clientPortalIdentityId, ctx.caseId, ctx.workspaceId, prisma);
  requirePermission(access, 'canViewMessages', 'CLIENT_MESSAGES_READ_DENIED');
  await customerParticipant(ctx, threadId, prisma);
  const thread = await prisma.clientQuestionThread.findFirst({ where: { id: threadId, caseId: ctx.caseId, workspaceId: ctx.workspaceId } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Question thread is not available.');
  const messages = await visibleMessages(threadId, prisma);
  return toThreadDto(thread, messages, await unreadFor(threadId, ctx.membershipId, prisma));
}

export async function sendCustomerMessage(ctx: CustomerContext, threadId: string, input: { bodySafe?: unknown; submissionFileIds?: unknown }, prisma: Prisma = defaultPrisma) {
  requireCapability('QUESTIONS');
  await requirePortalCommunication(ctx, prisma);
  const access = await resolveParticipantAccess(ctx.clientPortalIdentityId, ctx.caseId, ctx.workspaceId, prisma);
  requirePermission(access, 'canSendMessages', 'CLIENT_MESSAGES_SEND_DENIED');
  const participant = await customerParticipant(ctx, threadId, prisma);
  if (!participant.canWrite) throw new InteractionError(403, 'THREAD_WRITE_DENIED', 'This thread is read-only for this participant.');
  const body = safeText(input.bodySafe, 'bodySafe', 4000, true)!;
  const fileIds = await assertCleanSubmissionFiles(ctx, input.submissionFileIds, prisma);
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const message = await tx.clientQuestionMessage.create({
      data: { threadId, authorType: 'CLIENT', clientPortalIdentityId: ctx.clientPortalIdentityId, bodySafe: body, visibility: PUBLIC_MESSAGE_VISIBILITY, sentAt: now },
    });
    for (const fileId of fileIds) {
      await tx.clientQuestionMessageAttachment.create({ data: { messageId: message.id, submissionFileId: fileId, clientFacingTitle: 'Csatolmány' } });
    }
    await tx.clientQuestionThread.update({ where: { id: threadId }, data: { status: 'OPEN', lastMessageAt: now, revision: { increment: 1 } } });
    await tx.clientQuestionThreadReadState.upsert({
      where: { threadId_workspaceMembershipId: { threadId, workspaceMembershipId: ctx.membershipId } },
      create: { threadId, workspaceMembershipId: ctx.membershipId, lastReadMessageId: message.id, lastReadAt: now },
      update: { lastReadMessageId: message.id, lastReadAt: now },
    });
  });
  return getCustomerThread(ctx, threadId, prisma);
}

export async function markCustomerThreadRead(ctx: CustomerContext, threadId: string, prisma: Prisma = defaultPrisma) {
  await requirePortalCommunication(ctx, prisma);
  await customerParticipant(ctx, threadId, prisma);
  const latest = await prisma.clientQuestionMessage.findFirst({ where: { threadId, visibility: PUBLIC_MESSAGE_VISIBILITY }, orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true } });
  await prisma.clientQuestionThreadReadState.upsert({
    where: { threadId_workspaceMembershipId: { threadId, workspaceMembershipId: ctx.membershipId } },
    create: { threadId, workspaceMembershipId: ctx.membershipId, lastReadMessageId: latest?.id || null, lastReadAt: latest?.createdAt || new Date() },
    update: { lastReadMessageId: latest?.id || null, lastReadAt: latest?.createdAt || new Date() },
  });
  return { unreadCount: 0 };
}

export async function authorizeCustomerMessageAttachment(ctx: CustomerContext, threadId: string, attachmentId: string, prisma: Prisma = defaultPrisma) {
  await getCustomerThread(ctx, threadId, prisma);
  const attachment = await prisma.clientQuestionMessageAttachment.findFirst({
    where: { id: attachmentId, message: { threadId, visibility: PUBLIC_MESSAGE_VISIBILITY } },
    select: { id: true, submissionFileId: true, clientFacingTitle: true },
  });
  if (!attachment?.submissionFileId) throw new InteractionError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment is not available.');
  return { id: attachment.id, submissionFileId: attachment.submissionFileId, title: attachment.clientFacingTitle };
}

// ---- Internal side
export async function listThreadsInternal(actor: InternalActor, filter: { caseId?: string; status?: string; limit?: number; offset?: number }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const where: any = {};
  if (filter.caseId) where.caseId = filter.caseId;
  if (filter.status) where.status = filter.status;
  await applyInternalQueueCaseScope(where, actor, prisma);
  const limit = Math.min(Math.max(1, filter.limit ?? 50), 200);
  const offset = Math.max(0, filter.offset ?? 0);
  const [items, total] = await Promise.all([
    prisma.clientQuestionThread.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: offset, take: limit, include: { participants: true } }),
    prisma.clientQuestionThread.count({ where }),
  ]);
  return { items, total, limit, offset };
}

export async function getThreadInternal(actor: InternalActor, threadId: string, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const thread = await prisma.clientQuestionThread.findUnique({ where: { id: threadId }, include: { participants: true } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Thread not found.');
  await assertInternalCaseAccess(actor, thread.caseId, prisma);
  const messages = await prisma.clientQuestionMessage.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' }, include: { attachments: true } });
  return { thread, messages };
}

export async function createThreadInternal(actor: InternalActor, input: Row, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const caseId = String(input.caseId || '');
  const workspaceId = String(input.workspaceId || '');
  const caseRow = await assertInternalCaseAccess(actor, caseId, prisma);
  const workspace = await prisma.clientPortalWorkspace.findFirst({ where: { id: workspaceId, clientId: caseRow.clientId, status: 'ACTIVE' }, select: { id: true, clientId: true } });
  if (!workspace) throw new InteractionError(409, 'WORKSPACE_NOT_ACTIVE', 'Active workspace is required.');
  const participantMembershipIds = Array.isArray(input.participantMembershipIds) ? [...new Set(input.participantMembershipIds.map(String).filter(Boolean))] : [];
  if (!participantMembershipIds.length) throw new InteractionError(400, 'THREAD_PARTICIPANTS_REQUIRED', 'Select at least one participant.');
  const memberships = await prisma.clientPortalWorkspaceMembership.findMany({
    where: { id: { in: participantMembershipIds }, workspaceId, status: 'ACTIVE' },
    select: { id: true, clientPortalIdentityId: true },
  });
  if (memberships.length !== participantMembershipIds.length) throw new InteractionError(400, 'THREAD_PARTICIPANT_INVALID', 'Participant must be an active workspace member.');
  for (const membership of memberships) {
    await resolveParticipantAccess(membership.clientPortalIdentityId, caseId, workspaceId, prisma);
  }
  const subject = safeText(input.subject, 'subject', 200, true)!;
  return prisma.$transaction(async (tx) => {
    const thread = await tx.clientQuestionThread.create({
      data: {
        clientId: caseRow.clientId,
        caseId,
        workspaceId,
        clientPortalIdentityId: memberships[0].clientPortalIdentityId,
        category: category(input.category) as never,
        subject,
        status: 'OPEN',
        assignedInternalUserId: actor.userId,
      },
    });
    for (const membership of memberships) {
      await tx.clientQuestionThreadParticipant.create({ data: { threadId: thread.id, workspaceMembershipId: membership.id, participantRole: 'PARTICIPANT', canRead: true, canWrite: Boolean(input.participantsCanWrite) } });
    }
    return getThreadInternal(actor, thread.id, tx as never);
  });
}

export async function addThreadParticipant(actor: InternalActor, threadId: string, input: Row, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const thread = await prisma.clientQuestionThread.findUnique({ where: { id: threadId } });
  if (!thread?.workspaceId) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Thread not found.');
  await assertInternalCaseAccess(actor, thread.caseId, prisma);
  const membershipId = String(input.workspaceMembershipId || '');
  const membership = await prisma.clientPortalWorkspaceMembership.findFirst({ where: { id: membershipId, workspaceId: thread.workspaceId, status: 'ACTIVE' }, select: { id: true, clientPortalIdentityId: true } });
  if (!membership) throw new InteractionError(400, 'THREAD_PARTICIPANT_INVALID', 'Participant must be an active workspace member.');
  await resolveParticipantAccess(membership.clientPortalIdentityId, thread.caseId, thread.workspaceId, prisma);
  return prisma.clientQuestionThreadParticipant.upsert({
    where: { threadId_workspaceMembershipId: { threadId, workspaceMembershipId: membershipId } },
    create: { threadId, workspaceMembershipId: membershipId, participantRole: String(input.participantRole || 'PARTICIPANT') as never, canRead: input.canRead !== false, canWrite: Boolean(input.canWrite) },
    update: { removedAt: null, canRead: input.canRead !== false, canWrite: Boolean(input.canWrite), participantRole: String(input.participantRole || 'PARTICIPANT') as never },
  });
}

export async function removeThreadParticipant(actor: InternalActor, threadId: string, membershipId: string, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const thread = await prisma.clientQuestionThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Thread not found.');
  await assertInternalCaseAccess(actor, thread.caseId, prisma);
  return prisma.clientQuestionThreadParticipant.update({
    where: { threadId_workspaceMembershipId: { threadId, workspaceMembershipId: membershipId } },
    data: { removedAt: new Date(), canRead: false, canWrite: false },
  });
}

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

export async function sendAnswer(actor: InternalActor, threadId: string, messageId: string, input: { sendNotification?: boolean }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const thread = await prisma.clientQuestionThread.findUnique({ where: { id: threadId }, include: { participants: true } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Thread not found.');
  await assertInternalCaseAccess(actor, thread.caseId, prisma);
  const message = await prisma.clientQuestionMessage.findFirst({ where: { id: messageId, threadId, authorType: 'INTERNAL', visibility: 'DRAFT' } });
  if (!message) throw new InteractionError(404, 'DRAFT_ANSWER_NOT_FOUND', 'No draft answer to send.');

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.clientQuestionMessage.update({ where: { id: messageId }, data: { visibility: PUBLIC_MESSAGE_VISIBILITY, sentAt: now } });
    await tx.clientQuestionThread.update({ where: { id: threadId }, data: { status: 'ANSWERED', lastMessageAt: now, revision: { increment: 1 } } });
    if (input.sendNotification && isCapabilityEnabled('EMAIL_NOTIFICATIONS')) {
      for (const participant of thread.participants.filter((item) => !item.removedAt && item.canRead)) {
        const membership = await tx.clientPortalWorkspaceMembership.findUnique({ where: { id: participant.workspaceMembershipId }, select: { clientPortalIdentityId: true } });
        const identity = membership ? await tx.clientPortalIdentity.findUnique({ where: { id: membership.clientPortalIdentityId }, select: { normalizedEmail: true, displayName: true } }) : null;
        if (identity?.normalizedEmail) {
          await enqueueNotification({
            eventType: 'QUESTION_ANSWERED', clientId: thread.clientId, caseId: thread.caseId,
            recipientEmail: identity.normalizedEmail, recipientName: identity.displayName,
            subjectSafe: 'Új válasz az Adminiculum ügyfélportálon', createdById: actor.userId,
            idempotencyKey: `question-answer:${messageId}`,
          }, tx);
        }
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

export async function archiveThread(actor: InternalActor, threadId: string, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const thread = await prisma.clientQuestionThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new InteractionError(404, 'THREAD_NOT_FOUND', 'Thread not found.');
  await assertInternalCaseAccess(actor, thread.caseId, prisma);
  return prisma.clientQuestionThread.update({ where: { id: threadId }, data: { archivedAt: new Date(), revision: { increment: 1 } } });
}
