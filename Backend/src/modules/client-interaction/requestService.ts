/**
 * ClientRequest lifecycle (Phase 3-4, 11). Internal users draft/publish/cancel/
 * complete/expire; customers read only PUBLISHED requests for their granted case.
 * Draft is never client-readable. Customer submission never auto-completes a
 * request — completion is an explicit internal decision.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InteractionError, InternalActor, Prisma, CustomerContext,
  requireInternal, requireExpected, assertInternalCaseAccess, applyInternalQueueCaseScope, safeText, assertClientSafe, audienceSnapshot,
} from './base';
import { requireCapability, ClientInteractionCapability } from './gates';

const REQUEST_TYPES = new Set(['DOCUMENT_UPLOAD', 'INFORMATION_REQUEST', 'DATA_FORM', 'QUESTION_RESPONSE', 'CORRECTION_REQUEST', 'MISSING_DOCUMENT_REQUEST']);
// Customer-facing requests must never use legal-approval concepts.
const FORBIDDEN_TYPES = new Set(['APPROVAL_REQUEST', 'CONFIRMATION_REQUEST']);

function capabilityForType(type: string): ClientInteractionCapability {
  if (type === 'DATA_FORM' || type === 'INFORMATION_REQUEST') return 'DATA_REQUESTS';
  return 'DOCUMENT_REQUESTS';
}

function toClientSafeRequest(row: any) {
  const dto = {
    id: row.id,
    caseId: row.caseId,
    type: row.type,
    title: row.clientSafeTitle,
    instructions: row.clientSafeInstructions,
    dueAt: row.dueAt,
    required: row.required,
    status: row.status,
    documentSpec: row.documentSpec ?? null,
    publishedAt: row.publishedAt,
    fields: (row.fields || []).map((f: any) => ({ id: f.id, label: f.clientSafeLabel, helpText: f.helpTextSafe, type: f.type, required: f.required, maxLength: f.maxLength, options: f.options ?? null, order: f.displayOrder })),
  };
  assertClientSafe(dto);
  return dto;
}

function toInternalRequest(row: any) {
  return { ...row };
}

export async function createRequestDraft(actor: InternalActor, input: any, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const type = String(input.type || '');
  if (FORBIDDEN_TYPES.has(type)) throw new InteractionError(400, 'FORBIDDEN_REQUEST_TYPE', 'Legal-approval request types are not customer-facing.');
  if (!REQUEST_TYPES.has(type)) throw new InteractionError(400, 'INVALID_REQUEST_TYPE', 'Unknown request type.');
  const caseId = String(input.caseId || '');
  const { clientId } = await assertInternalCaseAccess(actor, caseId, prisma);
  const clientSafeTitle = safeText(input.clientSafeTitle, 'clientSafeTitle', 200, true)!;
  const clientSafeInstructions = safeText(input.clientSafeInstructions, 'clientSafeInstructions', 4000);
  const fields = Array.isArray(input.fields) ? input.fields : [];
  const created = await prisma.clientRequest.create({
    data: {
      clientId, caseId, createdById: actor.userId,
      assignedInternalUserId: input.assignedInternalUserId ? String(input.assignedInternalUserId) : null,
      type: type as any,
      status: 'DRAFT',
      clientSafeTitle, clientSafeInstructions,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      required: input.required !== false,
      documentSpec: input.documentSpec ?? undefined,
      audienceSnapshot: {},
      fields: fields.length ? {
        create: fields.slice(0, 40).map((f: any, i: number) => ({
          clientSafeLabel: safeText(f.label, 'field.label', 160, true)!,
          helpTextSafe: safeText(f.helpText, 'field.helpText', 400),
          type: String(f.type || 'SHORT_TEXT') as any,
          required: Boolean(f.required),
          maxLength: f.maxLength ? Number(f.maxLength) : null,
          options: f.options ?? undefined,
          dataCategory: f.dataCategory ? String(f.dataCategory).slice(0, 60) : null,
          displayOrder: Number.isFinite(f.order) ? Number(f.order) : i,
        })),
      } : undefined,
    },
    include: { fields: true },
  });
  return toInternalRequest(created);
}

export async function updateRequestDraft(actor: InternalActor, requestId: string, patch: any, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientRequest.findUnique({ where: { id: requestId } });
  if (!row) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
  await assertInternalCaseAccess(actor, row.caseId, prisma);
  if (row.status !== 'DRAFT' && row.status !== 'READY_TO_PUBLISH') throw new InteractionError(409, 'REQUEST_NOT_EDITABLE', 'Only draft requests can be edited.');
  requireExpected(row, patch.expectedRevision);
  const data: any = { revision: { increment: 1 } };
  if (patch.clientSafeTitle !== undefined) data.clientSafeTitle = safeText(patch.clientSafeTitle, 'clientSafeTitle', 200, true);
  if (patch.clientSafeInstructions !== undefined) data.clientSafeInstructions = safeText(patch.clientSafeInstructions, 'clientSafeInstructions', 4000);
  if (patch.dueAt !== undefined) data.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
  if (patch.required !== undefined) data.required = Boolean(patch.required);
  if (patch.documentSpec !== undefined) data.documentSpec = patch.documentSpec;
  if (patch.status === 'READY_TO_PUBLISH') data.status = 'READY_TO_PUBLISH';
  return prisma.clientRequest.update({ where: { id: requestId }, data, include: { fields: true } });
}

export async function publishRequest(actor: InternalActor, requestId: string, expectedRevision: unknown, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientRequest.findUnique({ where: { id: requestId } });
  if (!row) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
  await assertInternalCaseAccess(actor, row.caseId, prisma);
  requireCapability(capabilityForType(row.type));
  if (row.status !== 'DRAFT' && row.status !== 'READY_TO_PUBLISH') throw new InteractionError(409, 'REQUEST_NOT_PUBLISHABLE', 'Request cannot be published from its current state.');
  requireExpected(row, expectedRevision);
  // Snapshot the active audience (grant) at publish time so a later revocation
  // does not retroactively rewrite the published record.
  const grant = await prisma.clientPortalGrant.findFirst({ where: { clientId: row.clientId, caseId: row.caseId, status: 'ACTIVE' }, select: { id: true } });
  const snapshot = audienceSnapshot({ clientId: row.clientId, caseId: row.caseId, grantId: grant?.id || 'none' });
  return prisma.clientRequest.update({ where: { id: requestId }, data: { status: 'PUBLISHED', publishedAt: new Date(), audienceSnapshot: snapshot as any, revision: { increment: 1 } }, include: { fields: true } });
}

export async function cancelRequest(actor: InternalActor, requestId: string, expectedRevision: unknown, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientRequest.findUnique({ where: { id: requestId } });
  if (!row) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
  await assertInternalCaseAccess(actor, row.caseId, prisma);
  if (row.status === 'COMPLETED' || row.status === 'CANCELLED') throw new InteractionError(409, 'REQUEST_NOT_CANCELLABLE', 'Request cannot be cancelled.');
  requireExpected(row, expectedRevision);
  return prisma.clientRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED', cancelledAt: new Date(), revision: { increment: 1 } } });
}

/** Completion is an explicit internal decision — never automatic on submission. */
export async function completeRequest(actor: InternalActor, requestId: string, expectedRevision: unknown, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientRequest.findUnique({ where: { id: requestId } });
  if (!row) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
  await assertInternalCaseAccess(actor, row.caseId, prisma);
  if (row.status === 'COMPLETED' || row.status === 'CANCELLED') throw new InteractionError(409, 'REQUEST_NOT_COMPLETABLE', 'Request cannot be completed.');
  requireExpected(row, expectedRevision);
  return prisma.clientRequest.update({ where: { id: requestId }, data: { status: 'COMPLETED', completedAt: new Date(), revision: { increment: 1 } } });
}

/** Server-side expiry of overdue published requests. */
export async function expireDueRequests(prisma: Prisma = defaultPrisma) {
  const now = new Date();
  const res = await prisma.clientRequest.updateMany({
    where: { expiresAt: { not: null, lt: now }, status: { in: ['PUBLISHED', 'PARTIALLY_SUBMITTED'] } },
    data: { status: 'EXPIRED' },
  });
  return { expired: res.count };
}

export async function listRequestsInternal(actor: InternalActor, filter: { caseId?: string; status?: string; limit?: number; offset?: number }, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const where: any = {};
  if (filter.caseId) where.caseId = filter.caseId;
  if (filter.status) where.status = filter.status;
  await applyInternalQueueCaseScope(where, actor, prisma);
  const limit = Math.min(Math.max(1, filter.limit ?? 50), 200);
  const offset = Math.max(0, filter.offset ?? 0);
  const [items, total] = await Promise.all([
    prisma.clientRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit, include: { fields: true } }),
    prisma.clientRequest.count({ where }),
  ]);
  return { items: items.map(toInternalRequest), total, limit, offset };
}

// ---- Customer side: only PUBLISHED (and active) requests on the granted case.
const CUSTOMER_VISIBLE = ['PUBLISHED', 'PARTIALLY_SUBMITTED', 'SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'CORRECTION_REQUESTED'];

export async function listCustomerRequests(ctx: CustomerContext, prisma: Prisma = defaultPrisma) {
  const items = await prisma.clientRequest.findMany({
    where: { caseId: ctx.caseId, clientId: ctx.clientId, status: { in: CUSTOMER_VISIBLE as any } },
    orderBy: { publishedAt: 'desc' }, include: { fields: { orderBy: { displayOrder: 'asc' } } },
  });
  return { items: items.map(toClientSafeRequest) };
}

export async function getCustomerRequest(ctx: CustomerContext, requestId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.clientRequest.findFirst({
    where: { id: requestId, caseId: ctx.caseId, clientId: ctx.clientId, status: { in: CUSTOMER_VISIBLE as any } },
    include: { fields: { orderBy: { displayOrder: 'asc' } } },
  });
  if (!row) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request is not available.');
  return toClientSafeRequest(row);
}
