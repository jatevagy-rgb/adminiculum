import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { assertClientReadAccess, InteractionError, InternalActor, requireInternal, safeText } from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

const controlStatuses = new Set(['NOT_ASSESSED', 'PLANNED', 'IMPLEMENTING', 'IMPLEMENTED', 'PARTIAL', 'NOT_IMPLEMENTED']);
const evidenceStatuses = new Set(['PROVIDED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED']);
const sourceTypes = new Set(['DOCUMENT_VERSION', 'CLIENT_FACT', 'OBSERVATION', 'EXTERNAL_REFERENCE']);

function requiredString(value: unknown, field: string): string {
  const output = safeText(value, field, 300, true);
  if (!output) throw new InteractionError(400, 'FIELD_REQUIRED', `${field} is required.`);
  return output;
}

function freshness(validUntil: Date | null, now = new Date()): 'CURRENT' | 'STALE' {
  return validUntil && validUntil < now ? 'STALE' : 'CURRENT';
}

function assertEnum(value: unknown, allowed: Set<string>, field: string): string {
  const output = requiredString(value, field);
  if (!allowed.has(output)) throw new InteractionError(400, 'INVALID_FIELD', `${field} is invalid.`);
  return output;
}

function optionalDate(value: unknown, field: string): Date | null {
  if (value == null || value === '') return null;
  const output = new Date(String(value));
  if (Number.isNaN(output.getTime())) throw new InteractionError(400, 'INVALID_FIELD', `${field} is invalid.`);
  return output;
}

export async function createControlDefinition(
  actor: InternalActor,
  input: { key: unknown; title: unknown; description?: unknown; type: unknown; defaultReviewCadenceDays?: unknown },
  prisma: Prisma = defaultPrisma,
) {
  requireInternal(actor);
  const key = requiredString(input.key, 'key');
  const title = requiredString(input.title, 'title');
  const type = assertEnum(input.type, new Set(['ORGANIZATIONAL', 'TECHNICAL', 'PROCEDURAL', 'LEGAL', 'PHYSICAL']), 'type');
  const cadence = input.defaultReviewCadenceDays == null ? null : Number(input.defaultReviewCadenceDays);
  if (cadence !== null && (!Number.isInteger(cadence) || cadence < 1 || cadence > 3650)) {
    throw new InteractionError(400, 'INVALID_FIELD', 'defaultReviewCadenceDays is invalid.');
  }
  return prisma.controlDefinition.create({
    data: { key, title, description: safeText(input.description, 'description', 2000), type: type as never, defaultReviewCadenceDays: cadence },
  });
}

export async function mapControlToRequirement(
  actor: InternalActor,
  input: { requirementVersionId: unknown; controlDefinitionId: unknown; rationale?: unknown },
  prisma: Prisma = defaultPrisma,
) {
  requireInternal(actor);
  const requirementVersionId = requiredString(input.requirementVersionId, 'requirementVersionId');
  const controlDefinitionId = requiredString(input.controlDefinitionId, 'controlDefinitionId');
  const [requirement, definition] = await Promise.all([
    prisma.requirementVersion.findUnique({ where: { id: requirementVersionId }, select: { id: true } }),
    prisma.controlDefinition.findUnique({ where: { id: controlDefinitionId }, select: { id: true } }),
  ]);
  if (!requirement || !definition) throw new InteractionError(404, 'CONTROL_MAPPING_TARGET_NOT_FOUND', 'Requirement or control definition not found.');
  return prisma.requirementControlMap.create({
    data: { requirementVersionId, controlDefinitionId, rationale: safeText(input.rationale, 'rationale', 1000) },
  });
}

export async function createClientControl(
  actor: InternalActor,
  clientId: string,
  input: { controlDefinitionId: unknown; implementationStatus?: unknown; ownerUserId?: unknown; nextReviewAt?: unknown; notes?: unknown },
  prisma: Prisma = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, prisma);
  const controlDefinitionId = requiredString(input.controlDefinitionId, 'controlDefinitionId');
  const definition = await prisma.controlDefinition.findFirst({ where: { id: controlDefinitionId, status: 'ACTIVE' } });
  if (!definition) throw new InteractionError(404, 'CONTROL_DEFINITION_NOT_FOUND', 'Control definition not found.');
  const implementationStatus = input.implementationStatus == null ? 'NOT_ASSESSED' : assertEnum(input.implementationStatus, controlStatuses, 'implementationStatus');
  return prisma.clientControl.create({
    data: {
      clientId,
      controlDefinitionId,
      implementationStatus: implementationStatus as never,
      ownerUserId: input.ownerUserId == null ? null : requiredString(input.ownerUserId, 'ownerUserId'),
      nextReviewAt: optionalDate(input.nextReviewAt, 'nextReviewAt'),
      notes: safeText(input.notes, 'notes', 2000),
    },
    include: { controlDefinition: true, ownerUser: { select: { id: true, name: true } } },
  });
}

export async function updateClientControl(
  actor: InternalActor,
  clientId: string,
  controlId: string,
  input: { implementationStatus?: unknown; ownerUserId?: unknown; implementedAt?: unknown; lastReviewedAt?: unknown; nextReviewAt?: unknown; notes?: unknown },
  prisma: Prisma = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, prisma);
  const existing = await prisma.clientControl.findFirst({ where: { id: controlId, clientId } });
  if (!existing) throw new InteractionError(404, 'CLIENT_CONTROL_NOT_FOUND', 'Client control not found.');
  const implementationStatus = input.implementationStatus == null ? undefined : assertEnum(input.implementationStatus, controlStatuses, 'implementationStatus');
  return prisma.clientControl.update({
    where: { id: controlId },
    data: {
      implementationStatus: implementationStatus as never,
      ownerUserId: input.ownerUserId === undefined ? undefined : input.ownerUserId === null ? null : requiredString(input.ownerUserId, 'ownerUserId'),
      implementedAt: input.implementedAt === undefined ? undefined : optionalDate(input.implementedAt, 'implementedAt'),
      lastReviewedAt: input.lastReviewedAt === undefined ? undefined : optionalDate(input.lastReviewedAt, 'lastReviewedAt'),
      nextReviewAt: input.nextReviewAt === undefined ? undefined : optionalDate(input.nextReviewAt, 'nextReviewAt'),
      notes: input.notes === undefined ? undefined : safeText(input.notes, 'notes', 2000),
    },
    include: { controlDefinition: true, ownerUser: { select: { id: true, name: true } } },
  });
}

export async function getClientControl(actor: InternalActor, clientId: string, controlId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const row = await prisma.clientControl.findFirst({
    where: { id: controlId, clientId },
    include: { controlDefinition: true, ownerUser: { select: { name: true } }, evidenceLinks: { include: { evidenceRecord: true } } },
  });
  if (!row) throw new InteractionError(404, 'CLIENT_CONTROL_NOT_FOUND', 'Client control not found.');
  return {
    title: row.controlDefinition.title,
    implementationStatus: String(row.implementationStatus),
    owner: row.ownerUser?.name || null,
    lastReviewedAt: row.lastReviewedAt?.toISOString() || null,
    nextReviewAt: row.nextReviewAt?.toISOString() || null,
    evidence: row.evidenceLinks.map((link) => ({
      title: link.evidenceRecord.title,
      status: String(link.evidenceRecord.status),
      freshness: freshness(link.evidenceRecord.validUntil),
    })),
  };
}

export async function createEvidenceRecord(
  actor: InternalActor,
  clientId: string,
  input: {
    sourceType: unknown; title: unknown; description?: unknown; status?: unknown; providedAt?: unknown; reviewedAt?: unknown;
    reviewedByUserId?: unknown; validFrom?: unknown; validUntil?: unknown; documentVersionId?: unknown; clientFactId?: unknown;
    observationId?: unknown; externalReference?: unknown;
  },
  prisma: Prisma = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, prisma);
  const sourceType = assertEnum(input.sourceType, sourceTypes, 'sourceType');
  const refs = [input.documentVersionId, input.clientFactId, input.observationId, input.externalReference].filter((value) => value != null && String(value).trim() !== '');
  if (refs.length !== 1) throw new InteractionError(400, 'EVIDENCE_SOURCE_REQUIRED', 'Exactly one evidence source is required.');
  const documentVersionId = input.documentVersionId == null ? null : requiredString(input.documentVersionId, 'documentVersionId');
  const clientFactId = input.clientFactId == null ? null : requiredString(input.clientFactId, 'clientFactId');
  const observationId = input.observationId == null ? null : requiredString(input.observationId, 'observationId');
  const externalReference = input.externalReference == null ? null : safeText(input.externalReference, 'externalReference', 2000, true);
  if (sourceType === 'DOCUMENT_VERSION' && !documentVersionId) throw new InteractionError(400, 'EVIDENCE_SOURCE_MISMATCH', 'Document version source is required.');
  if (sourceType === 'CLIENT_FACT' && !clientFactId) throw new InteractionError(400, 'EVIDENCE_SOURCE_MISMATCH', 'Client fact source is required.');
  if (sourceType === 'OBSERVATION' && !observationId) throw new InteractionError(400, 'EVIDENCE_SOURCE_MISMATCH', 'Observation source is required.');
  if (sourceType === 'EXTERNAL_REFERENCE' && !externalReference) throw new InteractionError(400, 'EVIDENCE_SOURCE_MISMATCH', 'External reference is required.');

  if (documentVersionId) {
    const row = await prisma.documentVersion.findFirst({ where: { id: documentVersionId, document: { clientId } }, select: { id: true } });
    if (!row) throw new InteractionError(403, 'EVIDENCE_ARTIFACT_FORBIDDEN', 'Document version is outside this client.');
  }
  if (clientFactId) {
    const row = await prisma.clientFact.findFirst({ where: { id: clientFactId, clientId }, select: { id: true } });
    if (!row) throw new InteractionError(403, 'EVIDENCE_ARTIFACT_FORBIDDEN', 'Client fact is outside this client.');
  }
  if (observationId) {
    const row = await prisma.observation.findFirst({ where: { id: observationId, clientId }, select: { id: true } });
    if (!row) throw new InteractionError(403, 'EVIDENCE_ARTIFACT_FORBIDDEN', 'Observation is outside this client.');
  }
  const validFrom = optionalDate(input.validFrom, 'validFrom');
  const validUntil = optionalDate(input.validUntil, 'validUntil');
  if (validFrom && validUntil && validUntil < validFrom) {
    throw new InteractionError(400, 'EVIDENCE_VALIDITY_INVALID', 'validUntil must be on or after validFrom.');
  }
  const status = input.status == null ? 'PROVIDED' : assertEnum(input.status, evidenceStatuses, 'status');
  if ((status === 'ACCEPTED' || status === 'REJECTED') && (!input.reviewedAt || !input.reviewedByUserId)) {
    throw new InteractionError(400, 'EVIDENCE_REVIEW_REQUIRED', 'Accepted or rejected evidence requires review metadata.');
  }
  return prisma.evidenceRecord.create({
    data: {
      clientId, sourceType: sourceType as never, status: status as never, title: requiredString(input.title, 'title'),
      description: safeText(input.description, 'description', 2000),
      providedAt: input.providedAt == null ? new Date() : optionalDate(input.providedAt, 'providedAt'),
      reviewedAt: input.reviewedAt == null ? null : optionalDate(input.reviewedAt, 'reviewedAt'),
      reviewedByUserId: input.reviewedByUserId == null ? null : requiredString(input.reviewedByUserId, 'reviewedByUserId'),
      validFrom,
      validUntil,
      documentVersionId, clientFactId, observationId, externalReference,
    },
  });
}

export async function reviewEvidenceRecord(
  actor: InternalActor,
  clientId: string,
  evidenceRecordId: string,
  input: { status: unknown },
  prisma: Prisma = defaultPrisma,
) {
  await assertClientReadAccess(actor, clientId, prisma);
  const status = assertEnum(input.status, evidenceStatuses, 'status');
  const evidence = await prisma.evidenceRecord.findFirst({ where: { id: evidenceRecordId, clientId } });
  if (!evidence) throw new InteractionError(404, 'EVIDENCE_RECORD_NOT_FOUND', 'Evidence record not found.');
  const reviewed = status === 'ACCEPTED' || status === 'REJECTED';
  return prisma.evidenceRecord.update({
    where: { id: evidence.id },
    data: {
      status: status as never,
      reviewedAt: reviewed ? new Date() : null,
      reviewedByUserId: reviewed ? actor.userId : null,
    },
  });
}

export async function linkEvidenceToControl(actor: InternalActor, clientId: string, clientControlId: string, evidenceRecordId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const [control, evidence] = await Promise.all([
    prisma.clientControl.findFirst({ where: { id: clientControlId, clientId }, select: { id: true } }),
    prisma.evidenceRecord.findFirst({ where: { id: evidenceRecordId, clientId }, select: { id: true } }),
  ]);
  if (!control || !evidence) throw new InteractionError(403, 'EVIDENCE_CONTROL_FORBIDDEN', 'Evidence and control must belong to the same client.');
  return prisma.evidenceControlLink.create({ data: { clientId, clientControlId, evidenceRecordId } });
}

export async function getControlCoverage(actor: InternalActor, clientId: string, prisma: Prisma = defaultPrisma) {
  await assertClientReadAccess(actor, clientId, prisma);
  const now = new Date();
  const snapshots = await prisma.requirementApplicability.findMany({
    where: {
      clientId,
      requirementVersion: { status: 'APPROVED', effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      ruleVersion: { status: 'APPROVED', supersededById: null },
    },
    orderBy: [{ evaluationAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      requirementVersionId: true, ruleVersionId: true, scopeType: true, factSubjectId: true, outcome: true, requirementVersion: {
        select: { title: true, controlMaps: { include: { controlDefinition: true } } },
      },
    },
  });
  const latest = new Map<string, (typeof snapshots)[number]>();
  for (const row of snapshots) {
    const key = [row.requirementVersionId, row.ruleVersionId, row.scopeType, row.factSubjectId || ''].join(':');
    if (!latest.has(key)) latest.set(key, row);
  }
  const controls = await prisma.clientControl.findMany({
    where: { clientId },
    include: { controlDefinition: true, ownerUser: { select: { name: true } }, evidenceLinks: { include: { evidenceRecord: true } } },
  });
  const byDefinition = new Map(controls.map((control) => [control.controlDefinitionId, control]));
  return {
    requirements: [...latest.values()].filter((row) => row.outcome === 'APPLIES').map((row) => ({
      title: row.requirementVersion.title,
      applicability: String(row.outcome),
      controls: row.requirementVersion.controlMaps.map((map) => {
        const control = byDefinition.get(map.controlDefinitionId);
        const evidence = control?.evidenceLinks.map((link) => link.evidenceRecord) || [];
        const accepted = evidence.filter((item) => item.status === 'ACCEPTED');
        const current = accepted.filter((item) => freshness(item.validUntil, now) === 'CURRENT');
        return {
          title: map.controlDefinition.title,
          implementationStatus: control ? String(control.implementationStatus) : null,
          owner: control?.ownerUser?.name || null,
          lastReviewedAt: control?.lastReviewedAt?.toISOString() || null,
          nextReviewAt: control?.nextReviewAt?.toISOString() || null,
          evidenceSummary: { acceptedCurrent: current.length, stale: accepted.length - current.length, missing: current.length === 0 },
        };
      }),
    })),
  };
}
