/**
 * Transactional client-notification outbox (Phase 12-13).
 *
 * Enqueue is idempotent (unique idempotencyKey) and participates in the caller's
 * transaction, so request/answer creation succeeds independently of mail
 * delivery. Processing invokes the provider-independent mail adapter: with no
 * provider configured the delivery stays truthfully retryable
 * (MAIL_PROVIDER_NOT_CONFIGURED) — never SENT. The portal remains authoritative.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InteractionError, InternalActor, Prisma, requireInternal } from './base';
import { getMailSender, MailProviderError, DEFAULT_NOTIFICATION_BODY } from './mailAdapter';

type Tx = Prisma | any;

const MAX_ATTEMPTS = 6;

export interface EnqueueInput {
  eventType: string;
  clientId: string;
  caseId: string;
  recipientEmail: string;
  recipientName?: string | null;
  subjectSafe: string;
  templateId?: string | null;
  bodyOverrideSafe?: string | null;
  includeFullContent?: boolean;
  language?: string | null;
  createdById: string;
  idempotencyKey: string;
}

/**
 * Idempotently enqueue a notification. Safe to call inside a transaction.
 * Returns the delivery id; if the idempotencyKey already exists, returns the
 * existing one without creating a duplicate.
 */
export async function enqueueNotification(input: EnqueueInput, tx: Tx = defaultPrisma): Promise<{ id: string; deduped: boolean }> {
  const existing = await tx.clientNotificationDelivery.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { id: true } });
  if (existing) return { id: existing.id, deduped: true };
  const created = await tx.clientNotificationDelivery.create({
    data: {
      eventType: input.eventType,
      clientId: input.clientId,
      caseId: input.caseId,
      recipientSnapshot: { email: input.recipientEmail, name: input.recipientName || null },
      // Safe default subject/body unless an explicit bounded override is given.
      subjectSafe: input.subjectSafe,
      templateId: input.templateId || null,
      idempotencyKey: input.idempotencyKey,
      status: 'PENDING',
      nextAttemptAt: new Date(),
    },
    select: { id: true },
  });
  return { id: created.id, deduped: false };
}

function backoffMs(attempt: number): number {
  return Math.min(60_000 * 2 ** attempt, 6 * 60 * 60_000);
}

/**
 * Attempt delivery of one PENDING/retryable notification. Renders the safe
 * message and invokes the mail adapter. Never fakes SENT.
 */
export async function processDelivery(deliveryId: string, prisma: Prisma = defaultPrisma): Promise<{ status: string; codeSafe?: string }> {
  const row = await prisma.clientNotificationDelivery.findUnique({ where: { id: deliveryId } });
  if (!row) throw new InteractionError(404, 'DELIVERY_NOT_FOUND', 'Notification delivery not found.');
  if (row.status === 'SENT' || row.status === 'CANCELLED' || row.status === 'FAILED_FINAL') {
    return { status: row.status };
  }
  const recipient = (row.recipientSnapshot as { email?: string }) || {};
  await prisma.clientNotificationDelivery.update({ where: { id: deliveryId }, data: { status: 'SENDING', attemptCount: { increment: 1 } } });
  try {
    const result = await getMailSender().send({
      to: String(recipient.email || ''),
      subjectSafe: row.subjectSafe,
      bodyTextSafe: DEFAULT_NOTIFICATION_BODY,
      idempotencyKey: row.idempotencyKey,
      language: undefined,
    });
    await prisma.clientNotificationDelivery.update({
      where: { id: deliveryId },
      data: { status: 'SENT', provider: result.provider, providerMessageId: result.providerMessageId, sentAt: new Date(), lastErrorCodeSafe: null, nextAttemptAt: null },
    });
    return { status: 'SENT' };
  } catch (error) {
    const retryable = error instanceof MailProviderError ? error.retryable : true;
    const codeSafe = error instanceof MailProviderError ? error.codeSafe : 'MAIL_SEND_FAILED';
    const attempt = row.attemptCount + 1;
    const finalFail = !retryable || attempt >= MAX_ATTEMPTS;
    await prisma.clientNotificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: finalFail ? 'FAILED_FINAL' : 'FAILED_RETRYABLE',
        lastErrorCodeSafe: codeSafe,
        nextAttemptAt: finalFail ? null : new Date(Date.now() + backoffMs(attempt)),
      },
    });
    return { status: finalFail ? 'FAILED_FINAL' : 'FAILED_RETRYABLE', codeSafe };
  }
}

/** Internal failed-delivery queue. */
export async function listNotificationDeliveries(actor: InternalActor, filter: { caseId?: string; status?: string; limit?: number; offset?: number } = {}, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const where: any = {};
  if (filter.caseId) where.caseId = filter.caseId;
  if (filter.status) where.status = filter.status;
  const limit = Math.min(Math.max(1, filter.limit ?? 50), 200);
  const offset = Math.max(0, filter.offset ?? 0);
  const [items, total] = await Promise.all([
    prisma.clientNotificationDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit, select: { id: true, eventType: true, caseId: true, clientId: true, subjectSafe: true, status: true, attemptCount: true, lastErrorCodeSafe: true, nextAttemptAt: true, sentAt: true, createdAt: true } }),
    prisma.clientNotificationDelivery.count({ where }),
  ]);
  return { items, total, limit, offset };
}

/** Authorized manual retry of a failed delivery. */
export async function retryDelivery(actor: InternalActor, deliveryId: string, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientNotificationDelivery.findUnique({ where: { id: deliveryId }, select: { id: true, status: true } });
  if (!row) throw new InteractionError(404, 'DELIVERY_NOT_FOUND', 'Notification delivery not found.');
  if (row.status !== 'FAILED_RETRYABLE' && row.status !== 'FAILED_FINAL') {
    throw new InteractionError(409, 'DELIVERY_NOT_RETRYABLE', 'Only failed deliveries can be retried.');
  }
  await prisma.clientNotificationDelivery.update({ where: { id: deliveryId }, data: { status: 'PENDING', nextAttemptAt: new Date() } });
  return processDelivery(deliveryId, prisma);
}
