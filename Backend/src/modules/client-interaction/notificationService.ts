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
import { Prisma as PrismaClient } from '@prisma/client';
import { InteractionError, InternalActor, Prisma, applyInternalQueueCaseScope, requireInternal } from './base';
import { getMailSender, MailProviderError, DEFAULT_NOTIFICATION_BODY } from './mailAdapter';

type Tx = Prisma | any;

const MAX_ATTEMPTS = 6;

export interface EnqueueInput {
  eventType: string;
  clientId: string;
  caseId?: string | null;
  intakeRequestId?: string | null;
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
      caseId: input.caseId || null,
      intakeRequestId: input.intakeRequestId || null,
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
 *
 * `claimed` marks a row that the delivery worker already claimed atomically
 * (status PENDING/FAILED_RETRYABLE -> SENDING with attemptCount incremented),
 * so the claim step is skipped.
 */
export async function processDelivery(deliveryId: string, prisma: Prisma = defaultPrisma, options: { claimed?: boolean } = {}): Promise<{ status: string; codeSafe?: string }> {
  const row = await prisma.clientNotificationDelivery.findUnique({ where: { id: deliveryId } });
  if (!row) throw new InteractionError(404, 'DELIVERY_NOT_FOUND', 'Notification delivery not found.');
  if (row.status === 'SENT' || row.status === 'CANCELLED' || row.status === 'FAILED_FINAL') {
    return { status: row.status };
  }
  const recipient = (row.recipientSnapshot as { email?: string }) || {};
  if (!options.claimed) {
    await prisma.clientNotificationDelivery.update({ where: { id: deliveryId }, data: { status: 'SENDING', attemptCount: { increment: 1 } } });
  }
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
    const attempt = options.claimed ? row.attemptCount : row.attemptCount + 1;
    // A missing provider is a configuration gap, not a message failure: the
    // intent stays retryable until a provider is configured — never FAILED_FINAL.
    const providerNotConfigured = error instanceof MailProviderError && error.codeSafe === 'MAIL_PROVIDER_NOT_CONFIGURED';
    const finalFail = !retryable || (attempt >= MAX_ATTEMPTS && !providerNotConfigured);
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

/**
 * Atomically claim one due PENDING/FAILED_RETRYABLE delivery (SENDING). A
 * SENDING row older than the staleness window is a crashed attempt and is
 * reclaimed so a restart never orphans an intent. Returns null when nothing is
 * due. The conditional update is the concurrency guard: exactly one process
 * claims a row, so parallel ticks never deliver the same intent twice (and the
 * provider echoes the idempotencyKey as a second line of dedupe).
 */
const STALE_SENDING_MS = 5 * 60_000;

export async function claimDueDelivery(prisma: Prisma = defaultPrisma): Promise<{ id: string } | null> {
  const now = new Date();
  const dueWhere: PrismaClient.ClientNotificationDeliveryWhereInput = { status: { in: ['PENDING', 'FAILED_RETRYABLE'] }, nextAttemptAt: { lte: now } };
  const staleWhere: PrismaClient.ClientNotificationDeliveryWhereInput = { status: 'SENDING', updatedAt: { lte: new Date(now.getTime() - STALE_SENDING_MS) } };
  const candidate = await prisma.clientNotificationDelivery.findFirst({
    where: { OR: [dueWhere, staleWhere] },
    orderBy: { nextAttemptAt: 'asc' },
    select: { id: true },
  });
  if (!candidate) return null;
  const claimed = await prisma.clientNotificationDelivery.updateMany({
    where: { id: candidate.id, OR: [dueWhere, staleWhere] },
    data: { status: 'SENDING', attemptCount: { increment: 1 } },
  });
  return claimed.count === 1 ? { id: candidate.id } : null;
}

/** Process up to `limit` due deliveries. Used by the worker and by tests. */
export async function runDueDeliveriesOnce(limit = 10, prisma: Prisma = defaultPrisma): Promise<{ processed: number; sent: number }> {
  let processed = 0;
  let sent = 0;
  for (let index = 0; index < limit; index += 1) {
    const claimed = await claimDueDelivery(prisma);
    if (!claimed) break;
    const result = await processDelivery(claimed.id, prisma, { claimed: true });
    processed += 1;
    if (result.status === 'SENT') sent += 1;
  }
  return { processed, sent };
}

/**
 * Restart-safe delivery worker: every tick processes due PENDING/retryable
 * notifications. Ticks never overlap; failures never discard an intent (the
 * row stays SENDING/retryable and is re-claimed on the next tick). Returns a
 * stop function.
 */
export function startNotificationDeliveryWorker(options: { intervalMs?: number; limit?: number; prisma?: Prisma } = {}): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDueDeliveriesOnce(options.limit ?? 10, options.prisma);
    } catch (error) {
      console.error('[NotificationWorker] delivery tick failed', error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, options.intervalMs ?? 15_000);
  if (typeof timer.unref === 'function') timer.unref();
  void tick();
  return () => clearInterval(timer);
}

/** Internal failed-delivery queue. */
export async function listNotificationDeliveries(actor: InternalActor, filter: { caseId?: string; status?: string; limit?: number; offset?: number } = {}, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const where: any = {};
  if (filter.caseId) where.caseId = filter.caseId;
  if (filter.status) where.status = filter.status;
  await applyInternalQueueCaseScope(where, actor, prisma);
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
  const row = await prisma.clientNotificationDelivery.findUnique({ where: { id: deliveryId }, select: { id: true, status: true, caseId: true } });
  if (!row) throw new InteractionError(404, 'DELIVERY_NOT_FOUND', 'Notification delivery not found.');
  await applyInternalQueueCaseScope({ caseId: row.caseId }, actor, prisma);
  if (row.status !== 'FAILED_RETRYABLE' && row.status !== 'FAILED_FINAL') {
    throw new InteractionError(409, 'DELIVERY_NOT_RETRYABLE', 'Only failed deliveries can be retried.');
  }
  await prisma.clientNotificationDelivery.update({ where: { id: deliveryId }, data: { status: 'PENDING', nextAttemptAt: new Date() } });
  return processDelivery(deliveryId, prisma);
}
