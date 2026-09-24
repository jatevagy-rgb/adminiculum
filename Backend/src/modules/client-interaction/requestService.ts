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
const FIELD_TYPES = new Set(['SHORT_TEXT', 'LONG_TEXT', 'DATE', 'NUMBER', 'EMAIL', 'PHONE', 'ADDRESS', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'YES_NO']);

function normalizeFields(fields: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(fields)) return [];
  if (fields.length > 40) throw new InteractionError(400, 'TOO_MANY_FIELDS', 'A kérés legfeljebb 40 adatmezőt tartalmazhat.');
  return fields.map((field: any, index) => {
    const type = String(field?.type || '');
    if (!FIELD_TYPES.has(type)) throw new InteractionError(400, 'INVALID_FIELD_TYPE', 'Ismeretlen ügyfél-adatmező típus.');
    const label = safeText(field?.label, 'field.label', 160, true)!;
    const helpText = safeText(field?.helpText, 'field.helpText', 400);
    const options = type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE'
      ? (Array.isArray(field?.options) ? field.options.map((option: unknown) => safeText(option, 'field.option', 160, true)!) : [])
      : undefined;
    if (options && (!options.length || new Set(options).size !== options.length || options.length > 20)) {
      throw new InteractionError(400, 'INVALID_FIELD_OPTIONS', 'A választási lehetőségeknek egyedieknek és korlátozott számúnak kell lenniük.');
    }
    return { label, helpText, type, required: Boolean(field?.required), maxLength: field?.maxLength ? Math.min(Number(field.maxLength), 10000) : null, options, dataCategory: null, order: index };
  });
}

function normalizeDocumentSpec(value: unknown): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InteractionError(400, 'INVALID_DOCUMENT_SPEC', 'A dokumentumkövetelmény nem érvényes.');
  const spec = value as Record<string, unknown>;
  return {
    acceptedMimeTypes: Array.isArray(spec.acceptedMimeTypes) ? spec.acceptedMimeTypes.map((mime) => String(mime).slice(0, 100)).slice(0, 10) : ['application/pdf', 'image/jpeg', 'image/png'],
    maxFileCount: Math.min(Math.max(Number(spec.maxFileCount) || 1, 1), 20),
    maxFileSizeBytes: Math.min(Math.max(Number(spec.maxFileSizeBytes) || 10 * 1024 * 1024, 1), 50 * 1024 * 1024),
    totalSizeBytes: Math.min(Math.max(Number(spec.totalSizeBytes) || 20 * 1024 * 1024, 1), 200 * 1024 * 1024),
    mobilePhotoAccepted: Boolean(spec.mobilePhotoAccepted),
    frontBackRequired: Boolean(spec.frontBackRequired),
    replacementAllowed: Boolean(spec.replacementAllowed),
    internalReviewRequired: true,
  };
}

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
    // Customer-safe context label only — never internal ids, engine state, or
    // requirement/control/finding keys.
    contextLabel: complianceContextSafeLabel(row),
  };
  assertClientSafe(dto);
  return dto;
}

function toInternalRequest(row: any) {
  return {
    ...row,
    complianceContext: toInternalComplianceContext(row),
    contextLabel: complianceContextSafeLabel(row),
  };
}

/**
 * C4D provenance. Normalize + validate an optional single-origin Compliance
 * context. Returns the persisted reference columns (or nulls). Fails closed on
 * cross-client mismatch and on ambiguous multi-origin input.
 */
async function normalizeComplianceContext(
  actor: InternalActor,
  clientId: string,
  input: any,
  prisma: Prisma,
): Promise<{ requirementVersionId: string | null; clientControlId: string | null; findingId: string | null; contextLabel: string | null }> {
  const context = (input && typeof input === 'object' ? input.complianceContext : null) || null;
  if (!context || typeof context !== 'object') {
    return { requirementVersionId: null, clientControlId: null, findingId: null, contextLabel: null };
  }
  const requirementVersionId = context.requirementVersionId ? String(context.requirementVersionId) : null;
  const clientControlId = context.clientControlId ? String(context.clientControlId) : null;
  const findingId = context.findingId ? String(context.findingId) : null;
  const refs = [requirementVersionId, clientControlId, findingId].filter((value): value is string => Boolean(value));
  if (refs.length === 0) {
    return { requirementVersionId: null, clientControlId: null, findingId: null, contextLabel: null };
  }
  if (refs.length > 1) {
    throw new InteractionError(400, 'COMPLIANCE_CONTEXT_AMBIGUOUS', 'A request may originate from at most one Compliance context.');
  }
  let label: string | null = null;
  if (requirementVersionId) {
    const version = await prisma.requirementVersion.findUnique({ where: { id: requirementVersionId }, select: { id: true, title: true, requirementId: true } });
    if (!version) throw new InteractionError(404, 'COMPLIANCE_CONTEXT_NOT_FOUND', 'Compliance requirement version not found.');
    // A requirement version is not client-scoped; verify the client is actually
    // enrolled against it through an applicability snapshot.
    const applicability = await prisma.requirementApplicability.findFirst({ where: { clientId, requirementVersionId }, select: { id: true } });
    if (!applicability) throw new InteractionError(403, 'COMPLIANCE_CONTEXT_FORBIDDEN', 'Requirement version is not applicable to this client.');
    label = version.title;
  } else if (clientControlId) {
    const control = await prisma.clientControl.findFirst({ where: { id: clientControlId, clientId }, select: { id: true, controlDefinition: { select: { title: true } } } });
    if (!control) throw new InteractionError(403, 'COMPLIANCE_CONTEXT_FORBIDDEN', 'Control does not belong to this client.');
    label = control.controlDefinition.title;
  } else if (findingId) {
    const finding = await prisma.assessmentFinding.findFirst({ where: { id: findingId, clientId }, select: { id: true, title: true } });
    if (!finding) throw new InteractionError(403, 'COMPLIANCE_CONTEXT_FORBIDDEN', 'Finding does not belong to this client.');
    label = finding.title;
  }
  return { requirementVersionId, clientControlId, findingId, contextLabel: label };
}

function toInternalComplianceContext(row: any) {
  if (!row.requirementVersionId && !row.clientControlId && !row.findingId) return null;
  return {
    requirementVersionId: row.requirementVersionId ?? null,
    clientControlId: row.clientControlId ?? null,
    findingId: row.findingId ?? null,
  };
}

/** Customer-safe, derived provenance label — no internal identifier is exposed. */
function complianceContextSafeLabel(row: any): string | null {
  if (row.finding && row.finding.title) return row.finding.title;
  if (row.clientControl?.controlDefinition?.title) return row.clientControl.controlDefinition.title;
  if (row.requirementVersion?.title) return row.requirementVersion.title;
  return null;
}

function requireCaseRequest(row: { caseId: string | null }): string {
  if (!row.caseId) throw new InteractionError(409, 'REQUEST_IS_INTAKE_SCOPED', 'This request is managed through intake triage.');
  return row.caseId;
}

export async function createPublishedIntakeInformationRequestInTransaction(
  actor: InternalActor,
  input: {
    intakeRequestId: string;
    workspaceId: string;
    requesterMembershipId: string;
    clientId: string;
    title: unknown;
    instructions: unknown;
    dueAt?: unknown;
    fields?: unknown;
  },
  tx: any,
) {
  requireInternal(actor);
  requireCapability('DATA_REQUESTS');
  const fields = normalizeFields(input.fields || [{ type: 'LONG_TEXT', label: 'Válasz', required: true, maxLength: 6000 }]);
  return tx.clientRequest.create({
    data: {
      clientId: input.clientId,
      caseId: null,
      intakeRequestId: input.intakeRequestId,
      createdById: actor.userId,
      type: 'INFORMATION_REQUEST',
      status: 'PUBLISHED',
      clientSafeTitle: safeText(input.title, 'clientSafeTitle', 200, true)!,
      clientSafeInstructions: safeText(input.instructions, 'clientSafeInstructions', 4000, true)!,
      dueAt: input.dueAt ? new Date(String(input.dueAt)) : null,
      required: true,
      audienceSnapshot: {
        intakeRequestId: input.intakeRequestId,
        workspaceId: input.workspaceId,
        requesterMembershipId: input.requesterMembershipId,
        capturedAt: new Date().toISOString(),
      },
      publishedAt: new Date(),
      fields: fields.length ? { create: fields.map((field: any, index: number) => ({
        clientSafeLabel: field.label,
        helpTextSafe: field.helpText,
        type: field.type,
        required: field.required,
        maxLength: field.maxLength,
        options: field.options ?? undefined,
        dataCategory: null,
        displayOrder: index,
      })) } : undefined,
    },
    include: { fields: true },
  });
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
  const fields = normalizeFields(input.fields);
  const provenance = await normalizeComplianceContext(actor, clientId, input, prisma);
  const created = await prisma.clientRequest.create({
    data: {
      clientId, caseId, createdById: actor.userId,
      assignedInternalUserId: input.assignedInternalUserId ? String(input.assignedInternalUserId) : null,
      type: type as any,
      status: 'DRAFT',
      clientSafeTitle, clientSafeInstructions,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      required: input.required !== false,
      documentSpec: normalizeDocumentSpec(input.documentSpec) as any,
      audienceSnapshot: {},
      requirementVersionId: provenance.requirementVersionId,
      clientControlId: provenance.clientControlId,
      findingId: provenance.findingId,
      fields: fields.length ? {
          create: fields.map((f: any, i: number) => ({
          clientSafeLabel: f.label,
          helpTextSafe: f.helpText,
          type: f.type as any,
          required: f.required,
          maxLength: f.maxLength,
          options: f.options ?? undefined,
          dataCategory: null,
          displayOrder: i,
        })),
      } : undefined,
    },
    include: { fields: true, requirementVersion: { select: { title: true } }, clientControl: { select: { controlDefinition: { select: { title: true } } } }, finding: { select: { title: true } } },
  });
  return toInternalRequest(created);
}

export async function updateRequestDraft(actor: InternalActor, requestId: string, patch: any, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientRequest.findUnique({ where: { id: requestId } });
  if (!row) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
  await assertInternalCaseAccess(actor, requireCaseRequest(row), prisma);
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
  await assertInternalCaseAccess(actor, requireCaseRequest(row), prisma);
  requireCapability(capabilityForType(row.type));
  if (row.status !== 'DRAFT' && row.status !== 'READY_TO_PUBLISH') throw new InteractionError(409, 'REQUEST_NOT_PUBLISHABLE', 'Request cannot be published from its current state.');
  requireExpected(row, expectedRevision);
  // Snapshot the active audience (grant) at publish time so a later revocation
  // does not retroactively rewrite the published record.
  const caseId = requireCaseRequest(row);
  const grant = await prisma.clientPortalGrant.findFirst({ where: { clientId: row.clientId, caseId, status: 'ACTIVE' }, select: { id: true } });
  const snapshot = audienceSnapshot({ clientId: row.clientId, caseId, grantId: grant?.id || 'none' });
  return prisma.clientRequest.update({ where: { id: requestId }, data: { status: 'PUBLISHED', publishedAt: new Date(), audienceSnapshot: snapshot as any, revision: { increment: 1 } }, include: { fields: true } });
}

export async function cancelRequest(actor: InternalActor, requestId: string, expectedRevision: unknown, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientRequest.findUnique({ where: { id: requestId } });
  if (!row) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
  await assertInternalCaseAccess(actor, requireCaseRequest(row), prisma);
  if (row.status === 'COMPLETED' || row.status === 'CANCELLED') throw new InteractionError(409, 'REQUEST_NOT_CANCELLABLE', 'Request cannot be cancelled.');
  requireExpected(row, expectedRevision);
  return prisma.clientRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED', cancelledAt: new Date(), revision: { increment: 1 } } });
}

/** Completion is an explicit internal decision — never automatic on submission. */
export async function completeRequest(actor: InternalActor, requestId: string, expectedRevision: unknown, prisma: Prisma = defaultPrisma) {
  requireInternal(actor);
  const row = await prisma.clientRequest.findUnique({ where: { id: requestId } });
  if (!row) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request not found.');
  await assertInternalCaseAccess(actor, requireCaseRequest(row), prisma);
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
    prisma.clientRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit, include: {
      fields: true,
      requirementVersion: { select: { title: true } },
      clientControl: { select: { controlDefinition: { select: { title: true } } } },
      finding: { select: { title: true } },
    } }),
    prisma.clientRequest.count({ where }),
  ]);
  return { items: items.map(toInternalRequest), total, limit, offset };
}

// ---- Customer side: published requests and the customer's completed history on the granted case.
const CUSTOMER_VISIBLE = ['PUBLISHED', 'PARTIALLY_SUBMITTED', 'SUBMITTED', 'UNDER_INTERNAL_REVIEW', 'CORRECTION_REQUESTED', 'COMPLETED'];

export async function listCustomerRequests(ctx: CustomerContext, prisma: Prisma = defaultPrisma) {
  const items = await prisma.clientRequest.findMany({
    where: { caseId: ctx.caseId, clientId: ctx.clientId, status: { in: CUSTOMER_VISIBLE as any } },
    orderBy: { publishedAt: 'desc' },
    include: {
      fields: { orderBy: { displayOrder: 'asc' } },
      requirementVersion: { select: { title: true } },
      clientControl: { select: { controlDefinition: { select: { title: true } } } },
      finding: { select: { title: true } },
    },
  });
  return { items: items.map(toClientSafeRequest) };
}

export async function getCustomerRequest(ctx: CustomerContext, requestId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.clientRequest.findFirst({
    where: { id: requestId, caseId: ctx.caseId, clientId: ctx.clientId, status: { in: CUSTOMER_VISIBLE as any } },
    include: {
      fields: { orderBy: { displayOrder: 'asc' } },
      requirementVersion: { select: { title: true } },
      clientControl: { select: { controlDefinition: { select: { title: true } } } },
      finding: { select: { title: true } },
    },
  });
  if (!row) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Request is not available.');
  return toClientSafeRequest(row);
}
