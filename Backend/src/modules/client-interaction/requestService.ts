import { getComplianceWorkspace } from "../compliance/complianceWorkspaceService";
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
import { requireCapability, isCapabilityEnabled, ClientInteractionCapability } from './gates';
import { enqueueNotification } from './notificationService';

/** Customer delivery intent for an explicitly published request. */
export const REQUEST_PUBLISHED_SUBJECT = 'Új kérés érkezett az Adminiculum ügyfélportálra';

/** Distinct recipient emails of the ACTIVE grants on (clientId, caseId). */
async function activeGrantRecipients(clientId: string, caseId: string, prisma: Prisma): Promise<Array<{ email: string; name: string | null }>> {
  const grants = await prisma.clientPortalGrant.findMany({
    where: { clientId, caseId, status: 'ACTIVE' },
    select: { clientPortalIdentityId: true },
  });
  const identityIds = Array.from(new Set(grants.map((grant) => grant.clientPortalIdentityId).filter((id): id is string => Boolean(id))));
  if (!identityIds.length) return [];
  const identities = await prisma.clientPortalIdentity.findMany({ where: { id: { in: identityIds } }, select: { normalizedEmail: true, displayName: true } });
  const seen = new Set<string>();
  const recipients: Array<{ email: string; name: string | null }> = [];
  for (const identity of identities) {
    const email = String(identity.normalizedEmail || '').trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    recipients.push({ email, name: identity.displayName });
  }
  return recipients;
}

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

export function toClientSafeRequest(row: any) {
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
): Promise<{ requirementVersionId: string | null; clientControlId: string | null; findingId: string | null; contextLabel: string | null; origin?: { applicabilityId: string; factKey: string } }> {
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
  let origin: { applicabilityId: string; factKey: string } | undefined;
  if (context.applicabilityId || context.factKey) {
    if (!requirementVersionId || !context.applicabilityId || !context.factKey) throw new InteractionError(400, 'COMPLIANCE_FACT_CONTEXT_INCOMPLETE', 'Exact missing fact context is required.');
    const workspace = await getComplianceWorkspace(actor, clientId, prisma);
    const area = workspace.areas.find(item => item.applicabilityId === context.applicabilityId && item.requirementVersionId === requirementVersionId);
    if (!area || area.evaluationFreshness !== 'RECORDED' || !area.missingFacts.some(fact => fact.factKey === context.factKey)) throw new InteractionError(409, 'COMPLIANCE_FACT_CONTEXT_STALE', 'Refresh the evaluation before requesting this fact.');
    origin = { applicabilityId: String(context.applicabilityId), factKey: String(context.factKey) };
  }
  return { requirementVersionId, clientControlId, findingId, contextLabel: label, origin };
}

function toInternalComplianceContext(row: any) {
  if (!row.requirementVersionId && !row.clientControlId && !row.findingId) return null;
  return {
    ...(row.audienceSnapshot?.complianceOrigin || {}),
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
  const request = await tx.clientRequest.create({
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
  // Explicit publish -> one customer delivery intent for the requester, in the
  // same transaction as the PUBLISHED state transition. Provider failure can
  // never roll back the publish (the outbox retries independently).
  if (isCapabilityEnabled('EMAIL_NOTIFICATIONS')) {
    const membership = await tx.clientPortalWorkspaceMembership.findUnique({ where: { id: input.requesterMembershipId }, select: { clientPortalIdentityId: true } });
    const identity = membership ? await tx.clientPortalIdentity.findUnique({ where: { id: membership.clientPortalIdentityId }, select: { normalizedEmail: true, displayName: true } }) : null;
    if (identity?.normalizedEmail) {
      await enqueueNotification({
        eventType: 'REQUEST_PUBLISHED',
        clientId: input.clientId,
        intakeRequestId: input.intakeRequestId,
        recipientEmail: identity.normalizedEmail,
        recipientName: identity.displayName,
        subjectSafe: REQUEST_PUBLISHED_SUBJECT,
        createdById: actor.userId,
        idempotencyKey: `request-published:${request.id}`,
      }, tx);
    }
  }
  return request;
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
  // C5D Grow provenance: an optional single-origin recommendation link. The
  // recommendation must belong to the same client and must have been explicitly
  // reviewed with REQUEST_MORE_INFO (status NEEDS_MORE_DATA) — a request can
  // never attach itself to a recommendation that did not ask for information.
  const growContext = input && typeof input === 'object' ? input.growContext : null;
  let recommendationId: string | null = null;
  if (growContext && typeof growContext === 'object' && growContext.recommendationId) {
    recommendationId = String(growContext.recommendationId);
    const recommendation = await prisma.recommendationCandidate.findFirst({
      where: { id: recommendationId, clientId },
      select: { id: true, status: true },
    });
    if (!recommendation) throw new InteractionError(404, 'RECOMMENDATION_NOT_FOUND', 'Recommendation not found for this client.');
    if (recommendation.status !== 'NEEDS_MORE_DATA') {
      throw new InteractionError(409, 'RECOMMENDATION_NOT_PENDING_INFO', 'Only a recommendation explicitly reviewed with REQUEST_MORE_INFO can request customer information.');
    }
  }
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
      audienceSnapshot: provenance.origin ? { complianceOrigin: provenance.origin } : {},
      requirementVersionId: provenance.requirementVersionId,
      clientControlId: provenance.clientControlId,
      findingId: provenance.findingId,
      recommendationId,
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
  const origin = (row.audienceSnapshot as any)?.complianceOrigin;
  if (origin) await normalizeComplianceContext(actor, row.clientId, { complianceContext: { requirementVersionId: row.requirementVersionId, ...origin } }, prisma);
  const snapshot = { ...audienceSnapshot({ clientId: row.clientId, caseId, grantId: grant?.id || 'none' }), ...(origin ? { complianceOrigin: origin } : {}) };
  const recipients = await activeGrantRecipients(row.clientId, caseId, prisma);
  const revision = Number(row.revision);
  return prisma.$transaction(async (tx) => {
    // Conditional update: a concurrent publish/change wins exactly once, so the
    // publish and its notification intent are never duplicated.
    const published = await tx.clientRequest.updateMany({
      where: { id: requestId, status: { in: ['DRAFT', 'READY_TO_PUBLISH'] }, revision },
      data: { status: 'PUBLISHED', publishedAt: new Date(), audienceSnapshot: snapshot as any, revision: { increment: 1 } },
    });
    if (published.count === 0) throw new InteractionError(409, 'REQUEST_NOT_PUBLISHABLE', 'Request cannot be published from its current state.');
    // Explicit publish -> one customer delivery intent per ACTIVE grant
    // identity, transactionally aligned with the state transition.
    if (isCapabilityEnabled('EMAIL_NOTIFICATIONS')) {
      for (const recipient of recipients) {
        await enqueueNotification({
          eventType: 'REQUEST_PUBLISHED',
          clientId: row.clientId,
          caseId,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          subjectSafe: REQUEST_PUBLISHED_SUBJECT,
          createdById: actor.userId,
          idempotencyKey: `request-published:${requestId}`,
        }, tx);
      }
    }
    return tx.clientRequest.findUnique({ where: { id: requestId }, include: { fields: true } });
  });
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

/** Exported for company-level projections that must reuse the same visibility gate. */
export const customerVisibleRequestStatuses: string[] = CUSTOMER_VISIBLE;

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
