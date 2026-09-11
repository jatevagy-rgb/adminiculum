/**
 * COMPANY FOUNDATION (Phase 1) — internal workforce services.
 *
 * ClientOperatingProfile / ClientFact / CompanyMilestone / Assessment /
 * AssessmentItem / AssessmentFinding / DevelopmentInitiative.
 *
 * Reuses the canonical Client, Case, Task, User, DocumentVersion relations and
 * the client-safe validation posture from the client-interaction base. It does
 * NOT introduce a second Client / Task / Document / org hierarchy. Assessment
 * findings may drive remediation via the existing Task engine; initiatives may
 * use Case as an optional execution container.
 */
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InteractionError,
  InternalActor,
  assertClientReadAccess,
  assertClientSafe,
  forbidden,
  requireExpected,
  safeText,
} from '../client-interaction/base';
import { isCompanyAssessmentType, isCompanyFactType, isCompanyMilestoneType } from './registry';
import { createTypedFactAndEvaluate } from '../compliance/typedFactMutationService';

type Prisma = typeof defaultPrisma;

const MANAGER_ROLES = new Set(['ADMIN', 'PARTNER']);
const FACT_VERIFICATION = new Set(['CLIENT_PROVIDED', 'DOCUMENT_VERIFIED', 'LAW_FIRM_VERIFIED']);
const COMPLIANCE_ENROLLMENT = new Set(['ENROLLED', 'NOT_ENROLLED', 'SUSPENDED']);

const ASSESSMENT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

const FINDING_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['OPEN', 'ACTION_PLANNED'],
  ACTION_PLANNED: ['RESOLVED', 'OPEN'],
  RESOLVED: ['OPEN'],
};

const INITIATIVE_TRANSITIONS: Record<string, string[]> = {
  BACKLOG: ['PLANNED', 'CANCELLED'],
  PLANNED: ['ACTIVE', 'ON_HOLD', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'PLANNED', 'CANCELLED'],
  COMPLETED: ['PLANNED'],
  CANCELLED: ['PLANNED'],
};

function requireManager(actor: InternalActor): void {
  if (!actor?.userId || !MANAGER_ROLES.has(String(actor.role || ''))) {
    throw new InteractionError(403, 'COMPANY_MANAGE_FORBIDDEN', 'Only client managers may modify company records.');
  }
}


function assertTransition(from: string, to: string, table: Record<string, string[]>): void {
  if (!table[from]?.includes(to)) {
    throw new InteractionError(409, 'INVALID_STATUS_TRANSITION', `Transition ${from} -> ${to} is not allowed.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Same-client relationship guards.                                           */
/*                                                                            */
/* Foreign keys alone do NOT prevent a company record for Client A from       */
/* referencing a Case / Task / DocumentVersion / DevelopmentInitiative that   */
/* belongs to Client B. Every optional cross-entity reference taken from      */
/* request input is therefore verified against the canonical client-ownership */
/* path before it is persisted, so relational IDs cannot leak data across     */
/* clients.                                                                    */
/* -------------------------------------------------------------------------- */

async function assertDocumentVersionInClient(prisma: Prisma, clientId: string, documentVersionId: string): Promise<void> {
  const ok = await prisma.documentVersion.findFirst({ where: { id: documentVersionId, document: { clientId } }, select: { id: true } });
  if (!ok) throw new InteractionError(400, 'EVIDENCE_CROSS_CLIENT', 'Referenced document version does not belong to this client.');
}

async function assertInitiativeInClient(prisma: Prisma, clientId: string, initiativeId: string): Promise<void> {
  const ok = await prisma.developmentInitiative.findFirst({ where: { id: initiativeId, clientId }, select: { id: true } });
  if (!ok) throw new InteractionError(400, 'INITIATIVE_CROSS_CLIENT', 'Referenced initiative does not belong to this client.');
}

async function assertCaseInClient(prisma: Prisma, clientId: string, caseId: string): Promise<void> {
  const ok = await prisma.case.findFirst({ where: { id: caseId, clientId }, select: { id: true } });
  if (!ok) throw new InteractionError(400, 'CASE_CROSS_CLIENT', 'Referenced case does not belong to this client.');
}

async function assertTaskInClient(prisma: Prisma, clientId: string, taskId: string): Promise<void> {
  const ok = await prisma.task.findFirst({ where: { id: taskId, case: { clientId } }, select: { id: true } });
  if (!ok) throw new InteractionError(400, 'TASK_CROSS_CLIENT', 'Referenced remediation task does not belong to this client.');
}

async function assertItemInAssessment(prisma: Prisma, assessmentId: string, itemId: string): Promise<void> {
  const ok = await prisma.assessmentItem.findFirst({ where: { id: itemId, assessmentId }, select: { id: true } });
  if (!ok) throw new InteractionError(400, 'ITEM_CROSS_ASSESSMENT', 'Referenced assessment item does not belong to this assessment.');
}

/** Coherent validity interval: an explicit end date may not precede the start. */
function assertValidityInterval(validFrom: Date, validTo: Date | null): void {
  if (validTo && validTo.getTime() < validFrom.getTime()) {
    throw new InteractionError(400, 'FACT_VALIDITY_INVALID', 'validTo must be on or after validFrom.');
  }
}

/** Completed/archived assessments carry finalized professional findings and
 *  their items must not be silently mutated. Editing is limited to the working
 *  (DRAFT / IN_PROGRESS) states; controlled reopen/versioning is future scope. */
function assertAssessmentEditable(status: string): void {
  if (status === 'COMPLETED' || status === 'ARCHIVED') {
    throw new InteractionError(409, 'ASSESSMENT_LOCKED', 'A completed or archived assessment cannot be modified.');
  }
}

/* -------------------------------------------------------------------------- */
/* Operating profile                                                          */
/* -------------------------------------------------------------------------- */

export function toOperatingProfileDTO(row: any): any {
  const dto = {
    id: row.id,
    clientId: row.clientId,
    status: row.status,
    complianceEnrollmentStatus: row.complianceEnrollmentStatus,
    summary: row.summary,
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

export async function getOperatingProfile(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const row = await prisma.clientOperatingProfile.findUnique({ where: { clientId } });
  return row ? toOperatingProfileDTO(row) : null;
}

export async function upsertOperatingProfile(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const data: any = {};
  if (input.status !== undefined) data.status = safeText(input.status, 'status', 60, false);
  if (input.complianceEnrollmentStatus !== undefined) {
    requireManager(actor);
    const status = String(input.complianceEnrollmentStatus || '');
    if (!COMPLIANCE_ENROLLMENT.has(status)) throw new InteractionError(400, 'COMPLIANCE_ENROLLMENT_STATUS_INVALID', 'Invalid compliance enrollment status.');
    data.complianceEnrollmentStatus = status;
  }
  if (input.summary !== undefined) data.summary = safeText(input.summary, 'summary', 2000, false);
  if (input.lastReviewedAt !== undefined) data.lastReviewedAt = input.lastReviewedAt ? new Date(String(input.lastReviewedAt)) : null;
  if (input.nextReviewAt !== undefined) data.nextReviewAt = input.nextReviewAt ? new Date(String(input.nextReviewAt)) : null;
  const row = await prisma.clientOperatingProfile.upsert({
    where: { clientId },
    create: { clientId, ...data },
    update: data,
  });
  return toOperatingProfileDTO(row);
}

/* -------------------------------------------------------------------------- */
/* ClientFact                                                                 */
/* -------------------------------------------------------------------------- */

export function toFactDTO(row: any): any {
  const definitionType = row.factDefinition?.valueType ? String(row.factDefinition.valueType) : null;
  const typedValue = definitionType ? {
    valueType: definitionType,
    value: definitionType === 'BOOLEAN' ? row.booleanValue
      : definitionType === 'NUMBER' ? (row.numberValue === null ? null : Number(row.numberValue))
      : definitionType === 'DATE' ? (row.dateValue ? row.dateValue.toISOString().slice(0, 10) : null)
      : definitionType === 'DATETIME' ? (row.datetimeValue ? row.datetimeValue.toISOString() : null)
      : definitionType === 'MONEY' ? { amount: row.moneyAmount === null ? null : String(row.moneyAmount), currency: row.moneyCurrency }
      : definitionType === 'ENUM' || definitionType === 'JURISDICTION' ? row.enumValue
      : row.jsonValue,
  } : null;
  const displayValue = typedValue ? (definitionType === 'MONEY'
    ? `${typedValue.value.amount} ${typedValue.value.currency}`
    : typeof typedValue.value === 'object' ? JSON.stringify(typedValue.value) : String(typedValue.value)) : row.value;
  const dto = {
    id: row.id,
    clientId: row.clientId,
    type: row.type,
    value: displayValue,
    legacyValue: row.value,
    displayValue,
    factDefinitionId: row.factDefinitionId ?? null,
    scopeType: row.scopeType ?? null,
    factSubjectId: row.factSubjectId ?? null,
    typedValue,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo ? row.validTo.toISOString() : null,
    sourceReference: row.sourceReference,
    sourceDocumentVersionId: row.sourceDocumentVersionId,
    verificationStatus: row.verificationStatus,
    verifiedById: row.verifiedById,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

export async function listFacts(actor: InternalActor, clientId: string, opts: { type?: string; status?: string } = {}, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const rows = await prisma.clientFact.findMany({
    where: { clientId, ...(opts.type ? { type: opts.type } : {}), ...(opts.status ? { verificationStatus: opts.status as any } : {}) },
    orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    include: { factDefinition: { select: { valueType: true } } },
  });
  const dto = rows.map(toFactDTO);
  assertClientSafe(dto);
  return { items: dto };
}

export async function createFact(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  if (input.factDefinitionId) {
    return toFactDTO((await createTypedFactAndEvaluate({
      clientId,
      factDefinitionId: String(input.factDefinitionId),
      actorUserId: actor.userId,
      input,
    }, prisma)).fact);
  }
  const type = String(input.type || '');
  if (!isCompanyFactType(type)) throw new InteractionError(400, 'FACT_TYPE_UNKNOWN', 'Unknown company fact type.');
  const value = safeText(input.value, 'value', 2000, true)!;
  const validFrom = input.validFrom ? new Date(String(input.validFrom)) : new Date();
  const validTo = input.validTo ? new Date(String(input.validTo)) : null;
  assertValidityInterval(validFrom, validTo);
  const sourceDocumentVersionId = input.sourceDocumentVersionId ? String(input.sourceDocumentVersionId) : null;
  if (sourceDocumentVersionId) await assertDocumentVersionInClient(prisma, clientId, sourceDocumentVersionId);
  const row = await prisma.clientFact.create({
    data: {
      clientId,
      type,
      value,
      validFrom,
      validTo,
      sourceReference: safeText(input.sourceReference, 'sourceReference', 500, false),
      sourceDocumentVersionId,
      verificationStatus: 'UNVERIFIED',
    },
  });
  return toFactDTO(row);
}

export async function updateFact(actor: InternalActor, factId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.clientFact.findUnique({ where: { id: factId } });
  if (!row) throw new InteractionError(404, 'FACT_NOT_FOUND', 'Fact not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  if (row.factDefinitionId && Object.keys(input).some((key) => [
    'value', 'validFrom', 'validTo', 'sourceReference', 'sourceDocumentVersionId',
    'factDefinitionId', 'scopeType', 'factSubjectId', 'booleanValue', 'numberValue',
    'stringValue', 'dateValue', 'datetimeValue', 'moneyAmount', 'moneyCurrency',
    'enumValue', 'jsonValue', 'observedAt', 'effectiveAt', 'referencePeriodStart',
    'referencePeriodEnd', 'determinationMethod', 'supersededAt',
  ].includes(key))) {
    throw new InteractionError(409, 'TYPED_FACT_IMMUTABLE', 'Typed fact meaning and provenance are immutable; create a new fact instead.');
  }
  const data: any = {};
  if (input.value !== undefined) data.value = safeText(input.value, 'value', 2000, true)!;
  if (input.validFrom !== undefined) data.validFrom = new Date(String(input.validFrom));
  if (input.validTo !== undefined) data.validTo = input.validTo ? new Date(String(input.validTo)) : null;
  if (input.sourceReference !== undefined) data.sourceReference = safeText(input.sourceReference, 'sourceReference', 500, false);
  if (input.sourceDocumentVersionId !== undefined) {
    data.sourceDocumentVersionId = input.sourceDocumentVersionId ? String(input.sourceDocumentVersionId) : null;
    if (data.sourceDocumentVersionId) await assertDocumentVersionInClient(prisma, row.clientId, data.sourceDocumentVersionId);
  }
  // Coherent validity interval on the effective (post-update) values.
  const effectiveFrom = data.validFrom ?? row.validFrom;
  const effectiveTo = data.validTo !== undefined ? data.validTo : row.validTo;
  assertValidityInterval(effectiveFrom, effectiveTo);
  // Verification is server-authoritative and evidence-bound: a material change
  // to the asserted value or its source document must NOT silently retain a
  // prior verification. Reset to UNVERIFIED and clear the workforce attestation
  // so a fresh verification is required (history is preferred over a forged
  // attestation; full temporal versioning is deferred).
  const valueChanged = data.value !== undefined && data.value !== row.value;
  const sourceChanged = data.sourceDocumentVersionId !== undefined && data.sourceDocumentVersionId !== row.sourceDocumentVersionId;
  if (String(row.verificationStatus) !== 'UNVERIFIED' && (valueChanged || sourceChanged)) {
    data.verificationStatus = 'UNVERIFIED';
    data.verifiedById = null;
    data.verifiedAt = null;
  }
  const updated = await prisma.clientFact.update({ where: { id: factId }, data });
  return toFactDTO(updated);
}

/** Server-owned verification transition. Customers never self-assert
 *  DOCUMENT_VERIFIED / LAW_FIRM_VERIFIED — this is a workforce route and the
 *  transition is only reachable by client managers. */
export async function verifyFact(actor: InternalActor, factId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const status = String(input.verificationStatus || '');
  if (!FACT_VERIFICATION.has(status)) throw new InteractionError(400, 'FACT_VERIFICATION_INVALID', 'Invalid verification status.');
  const row = await prisma.clientFact.findUnique({ where: { id: factId } });
  if (!row) throw new InteractionError(404, 'FACT_NOT_FOUND', 'Fact not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  // DOCUMENT_VERIFIED must reference real evidence.
  if (status === 'DOCUMENT_VERIFIED' && !row.sourceDocumentVersionId) {
    throw new InteractionError(400, 'FACT_EVIDENCE_REQUIRED', 'Document verification requires a source document version.');
  }
  const updated = await prisma.clientFact.update({
    where: { id: factId },
    data: { verificationStatus: status as any, verifiedById: actor.userId, verifiedAt: new Date() },
  });
  return toFactDTO(updated);
}

/* -------------------------------------------------------------------------- */
/* CompanyMilestone                                                           */
/* -------------------------------------------------------------------------- */

export function toMilestoneDTO(row: any): any {
  const dto = {
    id: row.id,
    clientId: row.clientId,
    type: row.type,
    title: row.title,
    description: row.description,
    milestoneDate: row.milestoneDate ? row.milestoneDate.toISOString() : null,
    targetDate: row.targetDate ? row.targetDate.toISOString() : null,
    status: row.status,
    developmentInitiativeId: row.developmentInitiativeId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

export async function listMilestones(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const rows = await prisma.companyMilestone.findMany({
    where: { clientId },
    orderBy: [{ milestoneDate: 'desc' }, { createdAt: 'desc' }],
  });
  const dto = rows.map(toMilestoneDTO);
  assertClientSafe(dto);
  return { items: dto };
}

const MILESTONE_STATUS = new Set(['PLANNED', 'ACHIEVED', 'CANCELLED']);
const INITIATIVE_STATUS = new Set(['BACKLOG', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);

export async function createMilestone(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  const type = String(input.type || '');
  if (!isCompanyMilestoneType(type)) throw new InteractionError(400, 'MILESTONE_TYPE_UNKNOWN', 'Unknown company milestone type.');
  const status = String(input.status || 'PLANNED');
  if (!MILESTONE_STATUS.has(status)) throw new InteractionError(400, 'MILESTONE_STATUS_INVALID', 'Invalid milestone status.');
  const developmentInitiativeId = input.developmentInitiativeId ? String(input.developmentInitiativeId) : null;
  if (developmentInitiativeId) await assertInitiativeInClient(prisma, clientId, developmentInitiativeId);
  const row = await prisma.companyMilestone.create({
    data: {
      clientId,
      type,
      title: safeText(input.title, 'title', 240, true)!,
      description: safeText(input.description, 'description', 2000, false),
      milestoneDate: input.milestoneDate ? new Date(String(input.milestoneDate)) : null,
      targetDate: input.targetDate ? new Date(String(input.targetDate)) : null,
      status: status as any,
      developmentInitiativeId,
      createdByUserId: actor.userId,
    },
  });
  return toMilestoneDTO(row);
}

export async function updateMilestone(actor: InternalActor, milestoneId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.companyMilestone.findUnique({ where: { id: milestoneId } });
  if (!row) throw new InteractionError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const data: any = {};
  if (input.title !== undefined) data.title = safeText(input.title, 'title', 240, true)!;
  if (input.description !== undefined) data.description = safeText(input.description, 'description', 2000, false);
  if (input.milestoneDate !== undefined) data.milestoneDate = input.milestoneDate ? new Date(String(input.milestoneDate)) : null;
  if (input.targetDate !== undefined) data.targetDate = input.targetDate ? new Date(String(input.targetDate)) : null;
  if (input.status !== undefined) {
    assertTransition(String(row.status), String(input.status), { PLANNED: ['ACHIEVED', 'CANCELLED'], ACHIEVED: ['PLANNED'], CANCELLED: ['PLANNED'] });
    data.status = String(input.status);
  }
  if (input.developmentInitiativeId !== undefined) {
    data.developmentInitiativeId = input.developmentInitiativeId ? String(input.developmentInitiativeId) : null;
    if (data.developmentInitiativeId) await assertInitiativeInClient(prisma, row.clientId, data.developmentInitiativeId);
  }
  const updated = await prisma.companyMilestone.update({ where: { id: milestoneId }, data });
  return toMilestoneDTO(updated);
}

/* -------------------------------------------------------------------------- */
/* Assessment                                                                 */
/* -------------------------------------------------------------------------- */

export function toAssessmentDTO(row: any): any {
  const dto = {
    id: row.id,
    clientId: row.clientId,
    type: row.type,
    title: row.title,
    status: row.status,
    methodRef: row.methodRef,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    reviewAt: row.reviewAt ? row.reviewAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    itemCount: Array.isArray(row.items) ? row.items.length : undefined,
    findingCount: Array.isArray(row.findings) ? row.findings.length : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

export async function listAssessments(actor: InternalActor, clientId: string, opts: { type?: string; status?: string } = {}, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const rows = await prisma.assessment.findMany({
    where: { clientId, ...(opts.type ? { type: opts.type } : {}), ...(opts.status ? { status: opts.status as any } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  const dto = rows.map(toAssessmentDTO);
  assertClientSafe(dto);
  return { items: dto };
}

export async function createAssessment(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  const type = String(input.type || '');
  if (!isCompanyAssessmentType(type)) throw new InteractionError(400, 'ASSESSMENT_TYPE_UNKNOWN', 'Unknown assessment type.');
  const row = await prisma.assessment.create({
    data: {
      clientId,
      type,
      title: safeText(input.title, 'title', 240, true)!,
      status: 'DRAFT',
      methodRef: safeText(input.methodRef, 'methodRef', 120, false),
      createdByUserId: actor.userId,
    },
  });
  return toAssessmentDTO(row);
}

export async function getAssessment(actor: InternalActor, assessmentId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: { items: { orderBy: { createdAt: 'asc' } }, findings: true },
  });
  if (!row) throw new InteractionError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const dto = { ...toAssessmentDTO(row), items: row.items.map(toItemDTO), findings: row.findings.map(toFindingDTO) };
  assertClientSafe(dto);
  return dto;
}

export async function transitionAssessment(actor: InternalActor, assessmentId: string, action: 'start' | 'complete' | 'archive', input: Record<string, unknown> = {}, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!row) throw new InteractionError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const target = action === 'start' ? 'IN_PROGRESS' : action === 'complete' ? 'COMPLETED' : 'ARCHIVED';
  assertTransition(String(row.status), target, ASSESSMENT_TRANSITIONS);
  const data: any = { status: target };
  if (action === 'start') data.startedAt = row.startedAt ?? new Date();
  if (action === 'complete') data.completedAt = new Date();
  const updated = await prisma.assessment.update({ where: { id: assessmentId }, data });
  return toAssessmentDTO(updated);
}

export async function updateAssessmentMeta(actor: InternalActor, assessmentId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!row) throw new InteractionError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const data: any = {};
  if (input.title !== undefined) data.title = safeText(input.title, 'title', 240, true)!;
  if (input.methodRef !== undefined) data.methodRef = safeText(input.methodRef, 'methodRef', 120, false);
  if (input.reviewAt !== undefined) data.reviewAt = input.reviewAt ? new Date(String(input.reviewAt)) : null;
  const updated = await prisma.assessment.update({ where: { id: assessmentId }, data });
  return toAssessmentDTO(updated);
}

/* -------------------------------------------------------------------------- */
/* AssessmentItem                                                             */
/* -------------------------------------------------------------------------- */

export function toItemDTO(row: any): any {
  const dto = {
    id: row.id,
    assessmentId: row.assessmentId,
    key: row.key,
    label: row.label,
    kind: row.kind,
    currentPractice: row.currentPractice,
    maturityLevel: row.maturityLevel,
    statusCode: row.statusCode,
    evidenceSummary: row.evidenceSummary,
    comment: row.comment,
    targetState: row.targetState,
    reviewerUserId: row.reviewerUserId,
    evidenceDocumentVersionId: row.evidenceDocumentVersionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

function itemKind(value: unknown): string {
  const kind = String(value || 'QUESTION');
  if (!['FACT', 'QUESTION', 'CHECK'].includes(kind)) throw new InteractionError(400, 'ITEM_KIND_INVALID', 'Invalid assessment item kind.');
  return kind;
}

export async function addAssessmentItem(actor: InternalActor, assessmentId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
  if (!assessment) throw new InteractionError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found.');
  await assertClientReadAccess(actor, assessment.clientId, prisma);
  assertAssessmentEditable(assessment.status);
  const maturityLevel = input.maturityLevel != null && input.maturityLevel !== '' ? Number(input.maturityLevel) : null;
  if (maturityLevel != null && (maturityLevel < 0 || maturityLevel > 5)) throw new InteractionError(400, 'MATURITY_LEVEL_INVALID', 'Maturity level must be 0-5.');
  const evidenceDocumentVersionId = input.evidenceDocumentVersionId ? String(input.evidenceDocumentVersionId) : null;
  if (evidenceDocumentVersionId) await assertDocumentVersionInClient(prisma, assessment.clientId, evidenceDocumentVersionId);
  const row = await prisma.assessmentItem.create({
    data: {
      assessmentId,
      key: safeText(input.key, 'key', 80, true)!,
      label: safeText(input.label, 'label', 240, true)!,
      kind: itemKind(input.kind) as any,
      currentPractice: safeText(input.currentPractice, 'currentPractice', 2000, false),
      maturityLevel,
      statusCode: safeText(input.statusCode, 'statusCode', 80, false),
      evidenceSummary: safeText(input.evidenceSummary, 'evidenceSummary', 2000, false),
      comment: safeText(input.comment, 'comment', 2000, false),
      targetState: safeText(input.targetState, 'targetState', 2000, false),
      reviewerUserId: input.reviewerUserId ? String(input.reviewerUserId) : null,
      evidenceDocumentVersionId,
    },
  });
  return toItemDTO(row);
}

export async function updateAssessmentItem(actor: InternalActor, itemId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.assessmentItem.findUnique({ where: { id: itemId }, include: { assessment: true } });
  if (!row) throw new InteractionError(404, 'ITEM_NOT_FOUND', 'Assessment item not found.');
  await assertClientReadAccess(actor, row.assessment.clientId, prisma);
  assertAssessmentEditable(String(row.assessment.status));
  const data: any = {};
  if (input.label !== undefined) data.label = safeText(input.label, 'label', 240, true)!;
  if (input.currentPractice !== undefined) data.currentPractice = safeText(input.currentPractice, 'currentPractice', 2000, false);
  if (input.maturityLevel !== undefined) {
    const ml = input.maturityLevel != null && input.maturityLevel !== '' ? Number(input.maturityLevel) : null;
    if (ml != null && (ml < 0 || ml > 5)) throw new InteractionError(400, 'MATURITY_LEVEL_INVALID', 'Maturity level must be 0-5.');
    data.maturityLevel = ml;
  }
  if (input.statusCode !== undefined) data.statusCode = safeText(input.statusCode, 'statusCode', 80, false);
  if (input.evidenceSummary !== undefined) data.evidenceSummary = safeText(input.evidenceSummary, 'evidenceSummary', 2000, false);
  if (input.comment !== undefined) data.comment = safeText(input.comment, 'comment', 2000, false);
  if (input.targetState !== undefined) data.targetState = safeText(input.targetState, 'targetState', 2000, false);
  if (input.reviewerUserId !== undefined) data.reviewerUserId = input.reviewerUserId ? String(input.reviewerUserId) : null;
  if (input.evidenceDocumentVersionId !== undefined) {
    data.evidenceDocumentVersionId = input.evidenceDocumentVersionId ? String(input.evidenceDocumentVersionId) : null;
    if (data.evidenceDocumentVersionId) await assertDocumentVersionInClient(prisma, row.assessment.clientId, data.evidenceDocumentVersionId);
  }
  const updated = await prisma.assessmentItem.update({ where: { id: itemId }, data });
  return toItemDTO(updated);
}

/* -------------------------------------------------------------------------- */
/* AssessmentFinding                                                          */
/* -------------------------------------------------------------------------- */

export function toFindingDTO(row: any): any {
  const dto = {
    id: row.id,
    clientId: row.clientId,
    assessmentId: row.assessmentId,
    assessmentItemId: row.assessmentItemId,
    severity: row.severity,
    title: row.title,
    description: row.description,
    recommendation: row.recommendation,
    status: row.status,
    developmentInitiativeId: row.developmentInitiativeId,
    remediationTaskId: row.remediationTaskId,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

function findingSeverity(value: unknown): string {
  const s = String(value || 'MEDIUM');
  if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(s)) throw new InteractionError(400, 'FINDING_SEVERITY_INVALID', 'Invalid finding severity.');
  return s;
}

export async function listFindings(actor: InternalActor, clientId: string, opts: { status?: string; assessmentId?: string } = {}, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const rows = await prisma.assessmentFinding.findMany({
    where: { clientId, ...(opts.status ? { status: opts.status as any } : {}), ...(opts.assessmentId ? { assessmentId: opts.assessmentId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  const dto = rows.map(toFindingDTO);
  assertClientSafe(dto);
  return { items: dto };
}

export async function createFinding(actor: InternalActor, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const clientId = String(input.clientId || '');
  await assertClientReadAccess(actor, clientId, prisma);
  const assessmentId = String(input.assessmentId || '');
  const assessment = await prisma.assessment.findFirst({ where: { id: assessmentId, clientId }, select: { id: true } });
  if (!assessment) throw new InteractionError(404, 'ASSESSMENT_NOT_FOUND', 'Assessment not found for this client.');
  const assessmentItemId = input.assessmentItemId ? String(input.assessmentItemId) : null;
  if (assessmentItemId) await assertItemInAssessment(prisma, assessmentId, assessmentItemId);
  const developmentInitiativeId = input.developmentInitiativeId ? String(input.developmentInitiativeId) : null;
  if (developmentInitiativeId) await assertInitiativeInClient(prisma, clientId, developmentInitiativeId);
  const remediationTaskId = input.remediationTaskId ? String(input.remediationTaskId) : null;
  if (remediationTaskId) await assertTaskInClient(prisma, clientId, remediationTaskId);
  const row = await prisma.assessmentFinding.create({
    data: {
      clientId,
      assessmentId,
      assessmentItemId,
      severity: findingSeverity(input.severity) as any,
      title: safeText(input.title, 'title', 240, true)!,
      description: safeText(input.description, 'description', 3000, false),
      recommendation: safeText(input.recommendation, 'recommendation', 3000, false),
      status: 'OPEN',
      developmentInitiativeId,
      remediationTaskId,
      createdByUserId: actor.userId,
    },
  });
  return toFindingDTO(row);
}

export async function transitionFinding(actor: InternalActor, findingId: string, status: unknown, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const target = String(status || '');
  if (!['OPEN', 'ACKNOWLEDGED', 'ACTION_PLANNED', 'RESOLVED'].includes(target)) throw new InteractionError(400, 'FINDING_STATUS_INVALID', 'Invalid finding status.');
  const row = await prisma.assessmentFinding.findUnique({ where: { id: findingId } });
  if (!row) throw new InteractionError(404, 'FINDING_NOT_FOUND', 'Finding not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  assertTransition(String(row.status), target, FINDING_TRANSITIONS);
  const updated = await prisma.assessmentFinding.update({ where: { id: findingId }, data: { status: target as any } });
  return toFindingDTO(updated);
}

export async function linkFindingToInitiative(actor: InternalActor, findingId: string, developmentInitiativeId: string | null, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.assessmentFinding.findUnique({ where: { id: findingId } });
  if (!row) throw new InteractionError(404, 'FINDING_NOT_FOUND', 'Finding not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  if (developmentInitiativeId) await assertInitiativeInClient(prisma, row.clientId, developmentInitiativeId);
  const updated = await prisma.assessmentFinding.update({ where: { id: findingId }, data: { developmentInitiativeId } });
  return toFindingDTO(updated);
}

/* -------------------------------------------------------------------------- */
/* DevelopmentInitiative                                                      */
/* -------------------------------------------------------------------------- */

export function toInitiativeDTO(row: any): any {
  const dto = {
    id: row.id,
    clientId: row.clientId,
    title: row.title,
    reason: row.reason,
    currentState: row.currentState,
    targetState: row.targetState,
    priority: row.priority,
    status: row.status,
    lawFirmOwnerUserId: row.lawFirmOwnerUserId,
    lawFirmOwnerName: row.lawFirmOwner?.name ?? null,
    clientOwnerPersonId: row.clientOwnerPersonId,
    clientOwnerPersonName: row.clientOwnerPerson?.name ?? null,
    clientOwnerDisplay: row.clientOwnerPerson?.name ?? null,
    caseId: row.caseId,
    targetAt: row.targetAt ? row.targetAt.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return dto;
}

function initiativePriority(value: unknown): string {
  const p = String(value || 'MEDIUM');
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(p)) throw new InteractionError(400, 'INITIATIVE_PRIORITY_INVALID', 'Invalid initiative priority.');
  return p;
}

export async function listInitiatives(actor: InternalActor, clientId: string, opts: { status?: string } = {}, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const rows = await prisma.developmentInitiative.findMany({
    where: { clientId, ...(opts.status ? { status: opts.status as any } : {}) },
    include: {
      clientOwnerPerson: { select: { id: true, name: true } },
      lawFirmOwner: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
  const dto = rows.map(toInitiativeDTO);
  assertClientSafe(dto);
  return { items: dto };
}

export async function createInitiative(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  const status = String(input.status || 'BACKLOG');
  if (!INITIATIVE_STATUS.has(status)) throw new InteractionError(400, 'INITIATIVE_STATUS_INVALID', 'Invalid initiative status.');
  const caseId = input.caseId ? String(input.caseId) : null;
  if (caseId) await assertCaseInClient(prisma, clientId, caseId);
  const row = await prisma.developmentInitiative.create({
    data: {
      clientId,
      title: safeText(input.title, 'title', 240, true)!,
      reason: safeText(input.reason, 'reason', 2000, false),
      currentState: safeText(input.currentState, 'currentState', 2000, false),
      targetState: safeText(input.targetState, 'targetState', 2000, false),
      priority: initiativePriority(input.priority) as any,
      status: status as any,
      lawFirmOwnerUserId: input.lawFirmOwnerUserId ? String(input.lawFirmOwnerUserId) : null,
      caseId,
      targetAt: input.targetAt ? new Date(String(input.targetAt)) : null,
    },
  });
  return toInitiativeDTO(row);
}

export async function getInitiative(actor: InternalActor, initiativeId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.developmentInitiative.findUnique({
    where: { id: initiativeId },
    include: {
      clientOwnerPerson: { select: { id: true, name: true } },
      lawFirmOwner: { select: { id: true, name: true } },
      milestones: { orderBy: { targetDate: 'asc' } },
    },
  });
  if (!row) throw new InteractionError(404, 'INITIATIVE_NOT_FOUND', 'Initiative not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const dto = {
    ...toInitiativeDTO(row),
    milestones: row.milestones.map(toMilestoneDTO),
  };
  assertClientSafe(dto);
  return dto;
}

export async function updateInitiative(actor: InternalActor, initiativeId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.developmentInitiative.findUnique({ where: { id: initiativeId } });
  if (!row) throw new InteractionError(404, 'INITIATIVE_NOT_FOUND', 'Initiative not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  const data: any = {};
  if (input.title !== undefined) data.title = safeText(input.title, 'title', 240, true)!;
  if (input.reason !== undefined) data.reason = safeText(input.reason, 'reason', 2000, false);
  if (input.currentState !== undefined) data.currentState = safeText(input.currentState, 'currentState', 2000, false);
  if (input.targetState !== undefined) data.targetState = safeText(input.targetState, 'targetState', 2000, false);
  if (input.priority !== undefined) data.priority = initiativePriority(input.priority) as any;
  if (input.status !== undefined) {
    assertTransition(String(row.status), String(input.status), INITIATIVE_TRANSITIONS);
    data.status = String(input.status);
    if (String(input.status) === 'ACTIVE') data.startedAt = row.startedAt ?? new Date();
    if (String(input.status) === 'COMPLETED') data.completedAt = new Date();
    if (String(input.status) === 'PLANNED' && row.status === 'COMPLETED') data.completedAt = null;
  }
  if (input.lawFirmOwnerUserId !== undefined) data.lawFirmOwnerUserId = input.lawFirmOwnerUserId ? String(input.lawFirmOwnerUserId) : null;
  if (input.caseId !== undefined) {
    data.caseId = input.caseId ? String(input.caseId) : null;
    if (data.caseId) await assertCaseInClient(prisma, row.clientId, data.caseId);
  }
  if (input.targetAt !== undefined) data.targetAt = input.targetAt ? new Date(String(input.targetAt)) : null;
  const updated = await prisma.developmentInitiative.update({ where: { id: initiativeId }, data });
  return toInitiativeDTO(updated);
}

/* -------------------------------------------------------------------------- */
/* Grow With Us V2 — Business Systems & Business Processes (T1)              */
/* -------------------------------------------------------------------------- */

async function assertOrganizationPersonInClient(prisma: Prisma, clientId: string, personId: string): Promise<void> {
  const ok = await prisma.organizationPerson.findFirst({ where: { id: personId, clientId }, select: { id: true } });
  if (!ok) throw new InteractionError(400, 'CROSS_CLIENT_REFERENCE', 'Referenced person does not belong to this client.');
}

async function assertOrganizationGroupInClient(prisma: Prisma, clientId: string, groupId: string): Promise<void> {
  const ok = await prisma.clientOrganizationGroup.findFirst({ where: { id: groupId, clientId }, select: { id: true } });
  if (!ok) throw new InteractionError(400, 'CROSS_CLIENT_REFERENCE', 'Referenced organization group does not belong to this client.');
}

async function assertBusinessSystemInClient(prisma: Prisma, clientId: string, systemId: string): Promise<void> {
  const ok = await prisma.businessSystem.findFirst({ where: { id: systemId, clientId }, select: { id: true } });
  if (!ok) throw new InteractionError(400, 'CROSS_CLIENT_REFERENCE', 'Referenced business system does not belong to this client.');
}

/* -------------------------------------------------------------------------- */
/* BusinessSystem                                                             */
/* -------------------------------------------------------------------------- */

export function toBusinessSystemDTO(row: any): any {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    category: row.category,
    vendor: row.vendor ?? null,
    purpose: row.purpose ?? null,
    ownerPersonId: row.ownerPersonId ?? null,
    ownerPersonName: row.ownerPerson ? row.ownerPerson.name : null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listBusinessSystems(actor: InternalActor, clientId: string, filters?: { status?: string }, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const where: any = { clientId };
  if (filters?.status) where.status = String(filters.status);
  const rows = await prisma.businessSystem.findMany({
    where,
    include: { ownerPerson: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map(toBusinessSystemDTO);
}

export async function getBusinessSystem(actor: InternalActor, systemId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.businessSystem.findUnique({
    where: { id: systemId },
    include: { ownerPerson: { select: { id: true, name: true } } },
  });
  if (!row) throw new InteractionError(404, 'BUSINESS_SYSTEM_NOT_FOUND', 'Business system not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  return toBusinessSystemDTO(row);
}

export async function createBusinessSystem(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  const name = safeText(input.name, 'name', 120, true)!;
  const category = safeText(input.category, 'category', 80, false) || 'SOFTWARE';
  const vendor = safeText(input.vendor, 'vendor', 120, false);
  const purpose = safeText(input.purpose, 'purpose', 500, false);
  const status = safeText(input.status, 'status', 40, false) || 'ACTIVE';
  const ownerPersonId = input.ownerPersonId ? String(input.ownerPersonId) : null;

  if (ownerPersonId) {
    await assertOrganizationPersonInClient(prisma, clientId, ownerPersonId);
  }

  const existing = await prisma.businessSystem.findUnique({
    where: { clientId_name: { clientId, name } },
  });
  if (existing) {
    throw new InteractionError(409, 'DUPLICATE_SYSTEM_NAME', 'A business system with this name already exists for this client.');
  }

  const row = await prisma.businessSystem.create({
    data: {
      clientId,
      name,
      category,
      vendor,
      purpose,
      ownerPersonId,
      status,
    },
    include: { ownerPerson: { select: { id: true, name: true } } },
  });
  return toBusinessSystemDTO(row);
}

export async function updateBusinessSystem(actor: InternalActor, systemId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.businessSystem.findUnique({ where: { id: systemId } });
  if (!row) throw new InteractionError(404, 'BUSINESS_SYSTEM_NOT_FOUND', 'Business system not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);

  const data: any = {};
  if (input.name !== undefined) {
    const name = safeText(input.name, 'name', 120, true)!;
    if (name !== row.name) {
      const existing = await prisma.businessSystem.findUnique({
        where: { clientId_name: { clientId: row.clientId, name } },
      });
      if (existing) {
        throw new InteractionError(409, 'DUPLICATE_SYSTEM_NAME', 'A business system with this name already exists for this client.');
      }
      data.name = name;
    }
  }
  if (input.category !== undefined) data.category = safeText(input.category, 'category', 80, false) || 'SOFTWARE';
  if (input.vendor !== undefined) data.vendor = safeText(input.vendor, 'vendor', 120, false);
  if (input.purpose !== undefined) data.purpose = safeText(input.purpose, 'purpose', 500, false);
  if (input.status !== undefined) data.status = safeText(input.status, 'status', 40, false) || 'ACTIVE';
  if (input.ownerPersonId !== undefined) {
    const ownerPersonId = input.ownerPersonId ? String(input.ownerPersonId) : null;
    if (ownerPersonId) {
      await assertOrganizationPersonInClient(prisma, row.clientId, ownerPersonId);
    }
    data.ownerPersonId = ownerPersonId;
  }

  const updated = await prisma.businessSystem.update({
    where: { id: systemId },
    data,
    include: { ownerPerson: { select: { id: true, name: true } } },
  });
  return toBusinessSystemDTO(updated);
}

export async function deleteBusinessSystem(actor: InternalActor, systemId: string, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.businessSystem.findUnique({ where: { id: systemId } });
  if (!row) throw new InteractionError(404, 'BUSINESS_SYSTEM_NOT_FOUND', 'Business system not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);

  await prisma.businessSystem.delete({ where: { id: systemId } });
  return { deleted: true, id: systemId };
}

/* -------------------------------------------------------------------------- */
/* BusinessProcess & BusinessProcessStep                                     */
/* -------------------------------------------------------------------------- */

export function toBusinessProcessStepDTO(row: any): any {
  return {
    id: row.id,
    processId: row.processId,
    clientId: row.clientId,
    position: row.position,
    name: row.name,
    stepType: row.stepType,
    responsiblePersonId: row.responsiblePersonId ?? null,
    responsiblePersonName: row.responsiblePerson ? row.responsiblePerson.name : null,
    systemId: row.systemId ?? null,
    systemName: row.system ? row.system.name : null,
    estimatedActiveMinutes: row.estimatedActiveMinutes ?? null,
    estimatedWaitingMinutes: row.estimatedWaitingMinutes ?? null,
    isApproval: Boolean(row.isApproval),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBusinessProcessDTO(row: any): any {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    category: row.category,
    description: row.description ?? null,
    ownerPersonId: row.ownerPersonId ?? null,
    ownerPersonName: row.ownerPerson ? row.ownerPerson.name : null,
    organizationGroupId: row.organizationGroupId ?? null,
    organizationGroupName: row.organizationGroup ? row.organizationGroup.name : null,
    criticality: row.criticality,
    frequency: row.frequency,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    steps: Array.isArray(row.steps) ? row.steps.map(toBusinessProcessStepDTO) : undefined,
  };
}

export async function listBusinessProcesses(actor: InternalActor, clientId: string, filters?: { status?: string; category?: string }, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const where: any = { clientId };
  if (filters?.status) where.status = String(filters.status);
  if (filters?.category) where.category = String(filters.category);

  const rows = await prisma.businessProcess.findMany({
    where,
    include: {
      ownerPerson: { select: { id: true, name: true } },
      organizationGroup: { select: { id: true, name: true } },
      steps: {
        orderBy: { position: 'asc' },
        include: {
          responsiblePerson: { select: { id: true, name: true } },
          system: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return rows.map(toBusinessProcessDTO);
}

export async function getBusinessProcess(actor: InternalActor, processId: string, prisma: Prisma = defaultPrisma) {
  const row = await prisma.businessProcess.findUnique({
    where: { id: processId },
    include: {
      ownerPerson: { select: { id: true, name: true } },
      organizationGroup: { select: { id: true, name: true } },
      steps: {
        orderBy: { position: 'asc' },
        include: {
          responsiblePerson: { select: { id: true, name: true } },
          system: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!row) throw new InteractionError(404, 'BUSINESS_PROCESS_NOT_FOUND', 'Business process not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);
  return toBusinessProcessDTO(row);
}

export async function createBusinessProcess(actor: InternalActor, clientId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  await assertClientReadAccess(actor, clientId, prisma);
  const name = safeText(input.name, 'name', 160, true)!;
  const category = safeText(input.category, 'category', 80, false) || 'GENERAL';
  const description = safeText(input.description, 'description', 2000, false);
  const criticality = safeText(input.criticality, 'criticality', 40, false) || 'MEDIUM';
  const frequency = safeText(input.frequency, 'frequency', 40, false) || 'DAILY';
  const status = safeText(input.status, 'status', 40, false) || 'ACTIVE';
  const ownerPersonId = input.ownerPersonId ? String(input.ownerPersonId) : null;
  const organizationGroupId = input.organizationGroupId ? String(input.organizationGroupId) : null;

  if (ownerPersonId) {
    await assertOrganizationPersonInClient(prisma, clientId, ownerPersonId);
  }
  if (organizationGroupId) {
    await assertOrganizationGroupInClient(prisma, clientId, organizationGroupId);
  }

  const row = await prisma.businessProcess.create({
    data: {
      clientId,
      name,
      category,
      description,
      ownerPersonId,
      organizationGroupId,
      criticality,
      frequency,
      status,
    },
    include: {
      ownerPerson: { select: { id: true, name: true } },
      organizationGroup: { select: { id: true, name: true } },
      steps: { orderBy: { position: 'asc' } },
    },
  });
  return toBusinessProcessDTO(row);
}

export async function updateBusinessProcess(actor: InternalActor, processId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.businessProcess.findUnique({ where: { id: processId } });
  if (!row) throw new InteractionError(404, 'BUSINESS_PROCESS_NOT_FOUND', 'Business process not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);

  const data: any = {};
  if (input.name !== undefined) data.name = safeText(input.name, 'name', 160, true)!;
  if (input.category !== undefined) data.category = safeText(input.category, 'category', 80, false) || 'GENERAL';
  if (input.description !== undefined) data.description = safeText(input.description, 'description', 2000, false);
  if (input.criticality !== undefined) data.criticality = safeText(input.criticality, 'criticality', 40, false) || 'MEDIUM';
  if (input.frequency !== undefined) data.frequency = safeText(input.frequency, 'frequency', 40, false) || 'DAILY';
  if (input.status !== undefined) data.status = safeText(input.status, 'status', 40, false) || 'ACTIVE';

  if (input.ownerPersonId !== undefined) {
    const ownerPersonId = input.ownerPersonId ? String(input.ownerPersonId) : null;
    if (ownerPersonId) {
      await assertOrganizationPersonInClient(prisma, row.clientId, ownerPersonId);
    }
    data.ownerPersonId = ownerPersonId;
  }
  if (input.organizationGroupId !== undefined) {
    const organizationGroupId = input.organizationGroupId ? String(input.organizationGroupId) : null;
    if (organizationGroupId) {
      await assertOrganizationGroupInClient(prisma, row.clientId, organizationGroupId);
    }
    data.organizationGroupId = organizationGroupId;
  }

  const updated = await prisma.businessProcess.update({
    where: { id: processId },
    data,
    include: {
      ownerPerson: { select: { id: true, name: true } },
      organizationGroup: { select: { id: true, name: true } },
      steps: {
        orderBy: { position: 'asc' },
        include: {
          responsiblePerson: { select: { id: true, name: true } },
          system: { select: { id: true, name: true } },
        },
      },
    },
  });
  return toBusinessProcessDTO(updated);
}

export async function deleteBusinessProcess(actor: InternalActor, processId: string, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const row = await prisma.businessProcess.findUnique({ where: { id: processId } });
  if (!row) throw new InteractionError(404, 'BUSINESS_PROCESS_NOT_FOUND', 'Business process not found.');
  await assertClientReadAccess(actor, row.clientId, prisma);

  await prisma.businessProcess.delete({ where: { id: processId } });
  return { deleted: true, id: processId };
}

/* -------------------------------------------------------------------------- */
/* Process Steps                                                             */
/* -------------------------------------------------------------------------- */

export async function addProcessStep(actor: InternalActor, processId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const process = await prisma.businessProcess.findUnique({ where: { id: processId } });
  if (!process) throw new InteractionError(404, 'BUSINESS_PROCESS_NOT_FOUND', 'Business process not found.');
  await assertClientReadAccess(actor, process.clientId, prisma);

  const name = safeText(input.name, 'name', 160, true)!;
  const stepType = safeText(input.stepType, 'stepType', 40, false) || 'MANUAL';
  const isApproval = Boolean(input.isApproval);
  const estimatedActiveMinutes = input.estimatedActiveMinutes !== undefined && input.estimatedActiveMinutes !== null ? Math.max(0, Number(input.estimatedActiveMinutes)) : null;
  const estimatedWaitingMinutes = input.estimatedWaitingMinutes !== undefined && input.estimatedWaitingMinutes !== null ? Math.max(0, Number(input.estimatedWaitingMinutes)) : null;

  const responsiblePersonId = input.responsiblePersonId ? String(input.responsiblePersonId) : null;
  if (responsiblePersonId) {
    await assertOrganizationPersonInClient(prisma, process.clientId, responsiblePersonId);
  }

  const systemId = input.systemId ? String(input.systemId) : null;
  if (systemId) {
    await assertBusinessSystemInClient(prisma, process.clientId, systemId);
  }

  // Determine next position
  const maxStep = await prisma.businessProcessStep.findFirst({
    where: { processId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  const position = (maxStep?.position ?? 0) + 1;

  const step = await prisma.businessProcessStep.create({
    data: {
      processId,
      clientId: process.clientId,
      position,
      name,
      stepType,
      responsiblePersonId,
      systemId,
      estimatedActiveMinutes,
      estimatedWaitingMinutes,
      isApproval,
    },
    include: {
      responsiblePerson: { select: { id: true, name: true } },
      system: { select: { id: true, name: true } },
    },
  });
  return toBusinessProcessStepDTO(step);
}

export async function updateProcessStep(actor: InternalActor, stepId: string, input: Record<string, unknown>, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const step = await prisma.businessProcessStep.findUnique({
    where: { id: stepId },
    include: { process: { select: { clientId: true } } },
  });
  if (!step) throw new InteractionError(404, 'PROCESS_STEP_NOT_FOUND', 'Process step not found.');
  await assertClientReadAccess(actor, step.clientId, prisma);

  const data: any = {};
  if (input.name !== undefined) data.name = safeText(input.name, 'name', 160, true)!;
  if (input.stepType !== undefined) data.stepType = safeText(input.stepType, 'stepType', 40, false) || 'MANUAL';
  if (input.isApproval !== undefined) data.isApproval = Boolean(input.isApproval);
  if (input.estimatedActiveMinutes !== undefined) {
    data.estimatedActiveMinutes = input.estimatedActiveMinutes !== null ? Math.max(0, Number(input.estimatedActiveMinutes)) : null;
  }
  if (input.estimatedWaitingMinutes !== undefined) {
    data.estimatedWaitingMinutes = input.estimatedWaitingMinutes !== null ? Math.max(0, Number(input.estimatedWaitingMinutes)) : null;
  }

  if (input.responsiblePersonId !== undefined) {
    const responsiblePersonId = input.responsiblePersonId ? String(input.responsiblePersonId) : null;
    if (responsiblePersonId) {
      await assertOrganizationPersonInClient(prisma, step.clientId, responsiblePersonId);
    }
    data.responsiblePersonId = responsiblePersonId;
  }

  if (input.systemId !== undefined) {
    const systemId = input.systemId ? String(input.systemId) : null;
    if (systemId) {
      await assertBusinessSystemInClient(prisma, step.clientId, systemId);
    }
    data.systemId = systemId;
  }

  const updated = await prisma.businessProcessStep.update({
    where: { id: stepId },
    data,
    include: {
      responsiblePerson: { select: { id: true, name: true } },
      system: { select: { id: true, name: true } },
    },
  });
  return toBusinessProcessStepDTO(updated);
}

export async function reorderProcessSteps(actor: InternalActor, processId: string, stepIds: string[], prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const process = await prisma.businessProcess.findUnique({ where: { id: processId } });
  if (!process) throw new InteractionError(404, 'BUSINESS_PROCESS_NOT_FOUND', 'Business process not found.');
  await assertClientReadAccess(actor, process.clientId, prisma);

  const existingSteps = await prisma.businessProcessStep.findMany({
    where: { processId },
    select: { id: true },
  });
  const existingSet = new Set(existingSteps.map((s) => s.id));

  if (stepIds.length !== existingSet.size || !stepIds.every((id) => existingSet.has(id))) {
    throw new InteractionError(400, 'INVALID_REORDER_STEPS', 'Provided step IDs do not match the process steps.');
  }

  // Temporary negative positioning to avoid unique constraint collisions during swap
  for (let i = 0; i < stepIds.length; i++) {
    await prisma.businessProcessStep.update({
      where: { id: stepIds[i] },
      data: { position: -(i + 1) },
    });
  }
  for (let i = 0; i < stepIds.length; i++) {
    await prisma.businessProcessStep.update({
      where: { id: stepIds[i] },
      data: { position: i + 1 },
    });
  }

  const updatedSteps = await prisma.businessProcessStep.findMany({
    where: { processId },
    orderBy: { position: 'asc' },
    include: {
      responsiblePerson: { select: { id: true, name: true } },
      system: { select: { id: true, name: true } },
    },
  });
  return updatedSteps.map(toBusinessProcessStepDTO);
}

export async function removeProcessStep(actor: InternalActor, stepId: string, prisma: Prisma = defaultPrisma) {
  requireManager(actor);
  const step = await prisma.businessProcessStep.findUnique({ where: { id: stepId } });
  if (!step) throw new InteractionError(404, 'PROCESS_STEP_NOT_FOUND', 'Process step not found.');
  await assertClientReadAccess(actor, step.clientId, prisma);

  const processId = step.processId;
  await prisma.businessProcessStep.delete({ where: { id: stepId } });

  // Re-index remaining steps sequentially
  const remaining = await prisma.businessProcessStep.findMany({
    where: { processId },
    orderBy: { position: 'asc' },
    select: { id: true },
  });

  for (let i = 0; i < remaining.length; i++) {
    await prisma.businessProcessStep.update({
      where: { id: remaining[i].id },
      data: { position: i + 1 },
    });
  }

  return { deleted: true, id: stepId };
}

export { forbidden, requireExpected };

