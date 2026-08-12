import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientSafe, InteractionError, safeText } from '../client-interaction/base';
import { submitIntakeInformationResponseInTransaction } from '../client-interaction/submissionService';
import { loadOwnedIntake, resolveIntakeCustomerContext, resolveIntakeWorkspaceContext } from './intakePolicy';

type Prisma = typeof defaultPrisma;

const URGENCIES = new Set(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const FORBIDDEN_CUSTOMER_FIELDS = new Set([
  'workspaceId', 'clientId', 'requesterMembershipId', 'clientPortalIdentityId',
  'linkedCaseId', 'participantRole', 'permissions', 'status', 'internalTriageNote',
  'triagedByInternalUserId', 'submittedSnapshot', 'conversionFingerprint',
]);

const STATUS_LABELS: Record<string, { code: string; label: string }> = {
  DRAFT: { code: 'draft', label: 'Piszkozat' },
  SUBMITTED: { code: 'submitted', label: 'Beküldve' },
  TRIAGE_IN_PROGRESS: { code: 'triage-in-progress', label: 'Irodai feldolgozás alatt' },
  MORE_INFORMATION_REQUIRED: { code: 'more-information-required', label: 'További információ szükséges' },
  LINKED_TO_EXISTING_CASE: { code: 'linked', label: 'Meglévő ügyhöz kapcsolva' },
  CONVERTED_TO_CASE: { code: 'converted', label: 'Üggyé alakítva' },
  DECLINED: { code: 'declined', label: 'Elutasítva' },
  CLOSED: { code: 'closed', label: 'Lezárva' },
  WITHDRAWN: { code: 'withdrawn', label: 'Visszavonva' },
};

function rejectServerFields(input: Record<string, unknown>): void {
  const forbidden = Object.keys(input).find((key) => FORBIDDEN_CUSTOMER_FIELDS.has(key));
  if (forbidden) throw new InteractionError(400, 'INTAKE_FIELD_NOT_ALLOWED', `${forbidden} cannot be supplied by the customer.`);
}

function urgency(value: unknown): string {
  const output = String(value || 'NORMAL').trim().toUpperCase();
  if (!URGENCIES.has(output)) throw new InteractionError(400, 'INTAKE_URGENCY_INVALID', 'Urgency is invalid.');
  return output;
}

function requestedDeadline(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const output = new Date(String(value));
  if (Number.isNaN(output.getTime())) throw new InteractionError(400, 'INTAKE_DEADLINE_INVALID', 'Requested deadline is invalid.');
  return output;
}

function descriptionInput(input: Record<string, unknown>): unknown {
  return input.description !== undefined ? input.description : input.descriptionSafe;
}

async function audit(tx: any, workspaceId: string, membershipId: string, actorId: string, intakeId: string, action: string, fromStatus?: string | null, toStatus?: string | null) {
  await tx.clientPortalWorkspaceEvent.create({
    data: { workspaceId, membershipId, actorId, action, fromStatus: fromStatus || null, toStatus: toStatus || null, metadataSafe: { intakeId } },
  });
}

function attachmentState(status: string): string {
  if (status === 'CLEAN') return 'ready-for-review';
  if (status === 'INFECTED' || status === 'UNSUPPORTED' || status === 'REJECTED') return 'not-accepted';
  return 'processing-unavailable';
}

async function linkedPublicReference(intake: any, identityId: string, prisma: Prisma): Promise<string | null> {
  if (!intake.linkedCaseId || !['LINKED_TO_EXISTING_CASE', 'CONVERTED_TO_CASE', 'CLOSED'].includes(String(intake.status))) return null;
  const [grant, publication, caseRow] = await Promise.all([
    prisma.clientPortalGrant.findFirst({ where: { clientPortalIdentityId: identityId, workspaceId: intake.workspaceId, caseId: intake.linkedCaseId, status: 'ACTIVE', permissions: { has: 'MATTER_READ' } }, select: { id: true } }),
    prisma.clientMatterPublication.findFirst({ where: { workspaceId: intake.workspaceId, caseId: intake.linkedCaseId, status: 'PUBLISHED', currentRevisionId: { not: null } }, select: { id: true } }),
    prisma.case.findUnique({ where: { id: intake.linkedCaseId }, select: { caseNumber: true } }),
  ]);
  return grant && publication ? caseRow?.caseNumber || null : null;
}

async function toCustomerDto(intake: any, identityId: string, prisma: Prisma) {
  const group = intake.organizationGroupId
    ? await prisma.clientOrganizationGroup.findFirst({ where: { id: intake.organizationGroupId, workspaceId: intake.workspaceId }, select: { name: true } })
    : null;
  const latestRequest = (intake.informationRequests || []).find((request: any) => request.status === 'PUBLISHED');
  const status = STATUS_LABELS[String(intake.status)] || { code: 'processing', label: 'Feldolgozás alatt' };
  const dto = {
    reference: intake.id,
    subject: intake.subject,
    description: intake.descriptionSafe,
    organizationGroupName: group?.name || null,
    urgency: String(intake.urgency).toLowerCase(),
    requestedDeadline: intake.requestedDeadline,
    status,
    submittedAt: intake.submittedAt,
    updatedAt: intake.updatedAt,
    officeResponse: intake.customerResponseSafe,
    linkedPublicCaseReference: await linkedPublicReference(intake, identityId, prisma),
    allowedActions: {
      update: intake.status === 'DRAFT',
      submit: intake.status === 'DRAFT',
      withdraw: ['DRAFT', 'SUBMITTED', 'MORE_INFORMATION_REQUIRED'].includes(String(intake.status)),
      respond: intake.status === 'MORE_INFORMATION_REQUIRED' && Boolean(latestRequest),
    },
    informationRequest: latestRequest ? {
      reference: latestRequest.id,
      title: latestRequest.clientSafeTitle,
      instructions: latestRequest.clientSafeInstructions,
      dueAt: latestRequest.dueAt,
      fields: (latestRequest.fields || []).map((field: any) => ({
        reference: field.id,
        label: field.clientSafeLabel,
        helpText: field.helpTextSafe,
        type: field.type,
        required: field.required,
        maxLength: field.maxLength,
        options: field.options || null,
      })),
    } : null,
    attachments: (intake.attachments || []).map((attachment: any) => ({
      reference: attachment.id,
      fileName: attachment.originalFileNameSafe,
      sizeBytes: attachment.sizeBytes,
      state: attachmentState(String(attachment.status)),
      uploadedAt: attachment.uploadedAt,
    })),
  };
  assertClientSafe(dto);
  return dto;
}

export async function createIntakeDraft(identityId: string, workspaceId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  rejectServerFields(input);
  const groupId = String(input.organizationGroupId || '');
  const context = await resolveIntakeCustomerContext(identityId, workspaceId, groupId, prisma);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.clientPortalIntakeRequest.create({
      data: {
        workspaceId: context.workspaceId,
        requesterMembershipId: context.membershipId,
        organizationGroupId: context.organizationGroupId,
        subject: safeText(input.subject, 'subject', 240, true)!,
        descriptionSafe: safeText(descriptionInput(input), 'description', 6000, true)!,
        urgency: urgency(input.urgency) as never,
        requestedDeadline: requestedDeadline(input.requestedDeadline),
        status: 'DRAFT',
      },
      include: { attachments: true, informationRequests: { include: { fields: true } } },
    });
    await audit(tx, context.workspaceId, context.membershipId, identityId, created.id, 'INTAKE_DRAFT_CREATED', null, 'DRAFT');
    return created;
  });
  return toCustomerDto(row, identityId, prisma);
}

export async function updateIntakeDraft(identityId: string, workspaceId: string, intakeId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  rejectServerFields(input);
  const owned = await loadOwnedIntake(identityId, workspaceId, intakeId, prisma);
  if (String(owned.intake.status) !== 'DRAFT') throw new InteractionError(409, 'INTAKE_NOT_EDITABLE', 'Only a draft intake can be edited.');
  if (input.expectedRevision != null && Number(input.expectedRevision) !== Number(owned.intake.revision)) throw new InteractionError(409, 'REVISION_CONFLICT', 'The intake changed. Reload and retry.');
  let organizationGroupId = owned.intake.organizationGroupId as string;
  if (input.organizationGroupId !== undefined) {
    const context = await resolveIntakeCustomerContext(identityId, workspaceId, String(input.organizationGroupId || ''), prisma);
    organizationGroupId = context.organizationGroupId;
  }
  const data: any = { revision: { increment: 1 }, organizationGroupId };
  if (input.subject !== undefined) data.subject = safeText(input.subject, 'subject', 240, true)!;
  if (input.description !== undefined || input.descriptionSafe !== undefined) data.descriptionSafe = safeText(descriptionInput(input), 'description', 6000, true)!;
  if (input.urgency !== undefined) data.urgency = urgency(input.urgency);
  if (input.requestedDeadline !== undefined) data.requestedDeadline = requestedDeadline(input.requestedDeadline);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.clientPortalIntakeRequest.update({ where: { id: intakeId }, data, include: { attachments: true, informationRequests: { include: { fields: true } } } });
    await audit(tx, workspaceId, owned.membershipId, identityId, intakeId, 'INTAKE_DRAFT_UPDATED', 'DRAFT', 'DRAFT');
    return updated;
  });
  return toCustomerDto(row, identityId, prisma);
}

export async function submitIntake(identityId: string, workspaceId: string, intakeId: string, expectedRevision: unknown, prisma: Prisma = defaultPrisma) {
  const owned = await loadOwnedIntake(identityId, workspaceId, intakeId, prisma);
  if (String(owned.intake.status) !== 'DRAFT') {
    if (String(owned.intake.status) === 'SUBMITTED') return toCustomerDto(owned.intake, identityId, prisma);
    throw new InteractionError(409, 'INTAKE_NOT_SUBMITTABLE', 'Intake cannot be submitted from its current state.');
  }
  if (expectedRevision != null && Number(expectedRevision) !== Number(owned.intake.revision)) throw new InteractionError(409, 'REVISION_CONFLICT', 'The intake changed. Reload and retry.');
  const snapshot = {
    subject: owned.intake.subject,
    description: owned.intake.descriptionSafe,
    urgency: owned.intake.urgency,
    requestedDeadline: owned.intake.requestedDeadline,
    organizationGroupId: owned.intake.organizationGroupId,
  };
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.clientPortalIntakeRequest.update({
      where: { id: intakeId },
      data: { status: 'SUBMITTED', submittedAt: new Date(), submittedSnapshot: snapshot, revision: { increment: 1 } },
      include: { attachments: true, informationRequests: { include: { fields: true } } },
    });
    await audit(tx, workspaceId, owned.membershipId, identityId, intakeId, 'INTAKE_SUBMITTED', 'DRAFT', 'SUBMITTED');
    return updated;
  });
  return toCustomerDto(row, identityId, prisma);
}

export async function listOwnIntakes(identityId: string, workspaceId: string, params: { limit?: number; offset?: number }, prisma: Prisma = defaultPrisma) {
  const context = await resolveIntakeWorkspaceContext(identityId, workspaceId, prisma);
  const limit = Math.min(Math.max(1, Number(params.limit) || 20), 50);
  const offset = Math.max(0, Number(params.offset) || 0);
  const where = { workspaceId, requesterMembershipId: context.membershipId };
  const [rows, total] = await Promise.all([
    prisma.clientPortalIntakeRequest.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: offset, take: limit, include: { attachments: true, informationRequests: { include: { fields: true }, orderBy: { createdAt: 'desc' } } } }),
    prisma.clientPortalIntakeRequest.count({ where }),
  ]);
  return { items: await Promise.all(rows.map((row) => toCustomerDto(row, identityId, prisma))), total, limit, offset };
}

export async function getOwnIntake(identityId: string, workspaceId: string, intakeId: string, prisma: Prisma = defaultPrisma) {
  const owned = await loadOwnedIntake(identityId, workspaceId, intakeId, prisma);
  return toCustomerDto(owned.intake, identityId, prisma);
}

export async function withdrawIntake(identityId: string, workspaceId: string, intakeId: string, expectedRevision: unknown, prisma: Prisma = defaultPrisma) {
  const owned = await loadOwnedIntake(identityId, workspaceId, intakeId, prisma);
  const from = String(owned.intake.status);
  if (from === 'WITHDRAWN') return toCustomerDto(owned.intake, identityId, prisma);
  if (!['DRAFT', 'SUBMITTED', 'MORE_INFORMATION_REQUIRED'].includes(from)) throw new InteractionError(409, 'INTAKE_NOT_WITHDRAWABLE', 'Intake can no longer be withdrawn.');
  if (expectedRevision != null && Number(expectedRevision) !== Number(owned.intake.revision)) throw new InteractionError(409, 'REVISION_CONFLICT', 'The intake changed. Reload and retry.');
  const row = await prisma.$transaction(async (tx) => {
    await tx.clientRequest.updateMany({ where: { intakeRequestId: intakeId, status: 'PUBLISHED' }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    const updated = await tx.clientPortalIntakeRequest.update({ where: { id: intakeId }, data: { status: 'WITHDRAWN', closedAt: new Date(), revision: { increment: 1 } }, include: { attachments: true, informationRequests: { include: { fields: true } } } });
    await audit(tx, workspaceId, owned.membershipId, identityId, intakeId, 'INTAKE_WITHDRAWN', from, 'WITHDRAWN');
    return updated;
  });
  return toCustomerDto(row, identityId, prisma);
}

export async function respondToMoreInformation(identityId: string, workspaceId: string, intakeId: string, input: { requestId?: unknown; answers?: unknown }, prisma: Prisma = defaultPrisma) {
  const owned = await loadOwnedIntake(identityId, workspaceId, intakeId, prisma);
  if (String(owned.intake.status) !== 'MORE_INFORMATION_REQUIRED') throw new InteractionError(409, 'INTAKE_RESPONSE_NOT_EXPECTED', 'No further information is currently requested.');
  const requestId = String(input.requestId || '');
  const request = owned.intake.informationRequests.find((candidate: any) => candidate.id === requestId && candidate.status === 'PUBLISHED');
  if (!request) throw new InteractionError(404, 'REQUEST_NOT_FOUND', 'Information request is not available.');
  await prisma.$transaction(async (tx) => {
    await submitIntakeInformationResponseInTransaction({
      clientPortalIdentityId: identityId,
      membershipId: owned.membershipId,
      workspaceId,
      intakeId,
      requestId,
      answers: Array.isArray(input.answers) ? input.answers as Array<Record<string, unknown>> : [],
    }, tx);
    await tx.clientPortalIntakeRequest.update({ where: { id: intakeId }, data: { status: 'TRIAGE_IN_PROGRESS', revision: { increment: 1 } } });
    await audit(tx, workspaceId, owned.membershipId, identityId, intakeId, 'INTAKE_INFORMATION_RECEIVED', 'MORE_INFORMATION_REQUIRED', 'TRIAGE_IN_PROGRESS');
  });
  return getOwnIntake(identityId, workspaceId, intakeId, prisma);
}
