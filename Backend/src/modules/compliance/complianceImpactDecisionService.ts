import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InternalActor, InteractionError, assertClientReadAccess, internalCaseScope, requireInternal } from '../client-interaction/base';
import { hrConfidentialReadAllowed } from '../documents/authorization';
import { buildLegalSourceImpactForVersion } from './legalSourceImpact';
import { getLegalSourceObservationImpact } from './legalSourceObservationReviewService';
import { canonicalDigest } from './canonicalDigest';
import { reconcileClientComplianceInTx } from './complianceReconcileService';
import { startCaseFromProposalInTx, withProposalConfirmationRetry } from './complianceProposalService';
import { createRequirementVersion, addRequirementCitation } from './requirementRuleService';

type Db = PrismaClient | Prisma.TransactionClient;
export const IMPACT_CHOICES = ['NO_ACTION', 'REEVALUATE', 'REMEDIATION', 'RULE_REVIEW'] as const;
export type ImpactChoice = typeof IMPACT_CHOICES[number];

// Resolve the persisted workforce role, then reuse canonical role/client/case predicates.
export async function workbenchActor(actor: InternalActor, clientId: string, db: Db) {
  requireInternal(actor);
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { role: true } });
  const trusted = { userId: actor.userId, role: user?.role };
  requireInternal(trusted);
  await assertClientReadAccess(trusted, clientId, db as PrismaClient);
  return trusted;
}

export async function clientImpactContext(actor: InternalActor, clientId: string, observationId: string, db: Db = defaultPrisma, confirmed = true) {
  const trusted = await workbenchActor(actor, clientId, db);
  const allCases = await internalCaseScope(trusted, db as PrismaClient);
  const cases = await db.case.findMany({ where: { clientId, ...(allCases === null ? {} : { id: { in: allCases } }) }, select: { id: true } });
  const access = { readableClientIds: new Set([clientId]), readableCaseIds: new Set(cases.map(c => c.id)), hrConfidentialReadAllowed: hrConfidentialReadAllowed(trusted.role!) };
  const observation = await db.legalSourceObservation.findUnique({ where: { id: observationId }, include: { legalSource: true, legalSourceCapture: true } });
  if (!observation) throw new InteractionError(404, 'OBSERVATION_NOT_FOUND', 'Source observation not found.');
  let impact;
  if (confirmed || observation.reviewStatus === 'IMPACT_CONFIRMED') {
    impact = await getLegalSourceObservationImpact(observationId, access, db as PrismaClient);
  } else {
    let versionId = observation.legalSourceVersionId;
    if (!versionId && observation.kind === 'AMENDMENT_PUBLISHED') {
      const versions = await db.legalSourceVersion.findMany({ where: { legalSourceId: observation.legalSourceId, status: 'ACTIVE', reviewStatus: 'APPROVED' }, select: { id: true } });
      if (versions.length === 1) versionId = versions[0].id;
    }
    if (!versionId) throw new InteractionError(422, 'OBSERVATION_IMPACT_VERSION_UNAVAILABLE', 'No exact source version binding.');
    impact = await buildLegalSourceImpactForVersion(versionId, db as PrismaClient, access);
  }
  if (!impact?.subject || !impact.clients.some(c => c.clientId === clientId && c.impactKinds.length)) {
    throw new InteractionError(403, 'IMPACT_CLIENT_NOT_LINKED', 'No exact authorized impact for this client.');
  }
  const version = await db.legalSourceVersion.findUniqueOrThrow({ where: { id: impact.subject.legalSourceVersionId } });
  if (version.legalSourceId !== observation.legalSourceId) throw new InteractionError(409, 'IMPACT_SOURCE_BINDING_CONFLICT', 'Observation and version source identities differ.');
  // Transport/generatedAt and applicability evaluation timestamps are deliberately excluded.
  // Reconciliation may create snapshots but must not invalidate its own receipt.
  const sourceState = {
    observationId, payloadDigest: observation.payloadDigest, evidenceSha256: observation.evidenceSha256,
    reviewStatus: observation.reviewStatus, decidedAt: observation.decidedAt?.toISOString() ?? null,
    sourceId: observation.legalSourceId, sourceUpdatedAt: observation.legalSource.updatedAt.toISOString(),
    sourceStatus: observation.legalSource.status, version,
    capture: observation.legalSourceCapture ? {
      id: observation.legalSourceCapture.id, sourceSha256: observation.legalSourceCapture.sourceSha256,
      status: observation.legalSourceCapture.captureStatus, completeness: observation.legalSourceCapture.completeness,
      ambiguity: observation.legalSourceCapture.ambiguityStatus,
    } : null,
  };
  const provenance = {
    ...sourceState,
    requirementVersionIds: [...new Set(impact.requirementImpact.citations.map(c => c.requirementVersionId))].sort(),
    clientControlIds: impact.controlImpact.clientControls.map(c => c.clientControlId).sort(),
    documentVersionIds: [...new Set(impact.documentReferenceImpact.references.map(d => d.documentVersionId))].sort(),
  };
  // Source revision is actor-independent. Current exact client impact is revalidated on every command.
  return { trusted, observation, impact, version, provenance, sourceRevision: canonicalDigest(JSON.parse(JSON.stringify(sourceState))) };
}

export interface ImpactDecisionInput {
  sourceRevision: string;
  kind: ImpactChoice;
  note: string;
  proposalId?: string;
  requirementVersionId?: string;
  draft?: { versionKey: string; title: string; normativeStatement: string; effectiveFrom: string };
}

export async function decideClientImpact(actor: InternalActor, clientId: string, observationId: string, input: ImpactDecisionInput, db: PrismaClient = defaultPrisma) {
  if (!IMPACT_CHOICES.includes(input.kind) || typeof input.sourceRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.sourceRevision || '') ||
      typeof input.note !== 'string' || !input.note.trim() || input.note.length > 2000) {
    throw new InteractionError(400, 'IMPACT_DECISION_INVALID', 'An explicit choice, reason and source revision are required.');
  }
  // Canonical retry wrapper: serializable, retry on write conflicts; one receipt and work bridge commit together.
  return withProposalConfirmationRetry(db, async tx => {
    const ctx = await clientImpactContext(actor, clientId, observationId, tx);
    if (ctx.sourceRevision !== input.sourceRevision) throw new InteractionError(409, 'IMPACT_SOURCE_REVISION_CONFLICT', 'Source revision changed. Reload before deciding.');
    const request = { kind: input.kind, note: input.note.trim(), proposalId: input.proposalId ?? null, requirementVersionId: input.requirementVersionId ?? null, draft: input.draft ?? null };
    const requestDigest = canonicalDigest(request);
    const key = { clientId, observationId, sourceRevision: ctx.sourceRevision };
    const existing = await tx.complianceImpactDecision.findUnique({ where: { clientId_observationId_sourceRevision: key } });
    if (existing) {
      if (existing.requestDigest !== requestDigest) throw new InteractionError(409, 'IMPACT_ALREADY_DECIDED', 'This source revision already has an operator decision.');
      return existing;
    }
    let result: Prisma.InputJsonValue = {};
    const affected = ctx.impact.requirementImpact.citations.map(c => c.requirementVersionId);
    if (input.kind === 'REEVALUATE') {
      result = { reconciliation: { ...await reconcileClientComplianceInTx(clientId, ctx.trusted.userId, tx) } };
    } else if (input.kind === 'REMEDIATION') {
      const proposal = input.proposalId ? await tx.complianceProposal.findFirst({ where: {
        id: input.proposalId, clientId, proposalKind: 'REMEDIATION', applicabilityAtProposal: { requirementVersionId: { in: affected } },
      } }) : null;
      if (!proposal) throw new InteractionError(409, 'IMPACT_PROPOSAL_NOT_LINKED', 'Choose an existing remediation proposal for an exactly impacted requirement.');
      const work = await startCaseFromProposalInTx(ctx.trusted, proposal.id, {}, tx);
      if (work.kind === 'STALE') throw new InteractionError(409, 'PROPOSAL_STALE', 'The proposal must be reviewed again.');
      result = { proposalId: proposal.id, caseId: work.case.id, taskId: work.task.id };
    } else if (input.kind === 'RULE_REVIEW') {
      if (!input.requirementVersionId || !affected.includes(input.requirementVersionId) || !input.draft) throw new InteractionError(400, 'IMPACT_RULE_NOT_LINKED', 'Choose an exactly impacted requirement and supply a review draft.');
      const draft = input.draft;
      if ([draft.versionKey, draft.title, draft.normativeStatement].some(v => typeof v !== 'string' || !v.trim()) || draft.versionKey.length > 100 || draft.title.length > 300 || draft.normativeStatement.length > 10000 || !Number.isFinite(new Date(draft.effectiveFrom).getTime())) throw new InteractionError(400, 'IMPACT_DRAFT_INVALID', 'Draft wording, version label and effective date are required.');
      const parent = await tx.requirementVersion.findUniqueOrThrow({ where: { id: input.requirementVersionId } });
      const version = await createRequirementVersion({ requirementId: parent.requirementId, versionKey: draft.versionKey.trim(), title: draft.title.trim(), normativeStatement: draft.normativeStatement.trim(), effectiveFrom: new Date(draft.effectiveFrom), status: 'IN_REVIEW', sourceSupportState: 'LEGAL_REVIEW_REQUIRED', createdById: ctx.trusted.userId, db: tx });
      await addRequirementCitation({ requirementVersionId: version.id, legalSourceVersionId: ctx.version.id, supportRole: 'PRIMARY', db: tx });
      result = { requirementVersionId: version.id, status: version.status };
    }
    return tx.complianceImpactDecision.create({ data: { ...key, legalSourceVersionId: ctx.version.id, requestDigest, kind: input.kind, note: input.note.trim(), decidedById: ctx.trusted.userId, provenance: JSON.parse(JSON.stringify(ctx.provenance)), result } });
  }).catch(error => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
      throw new InteractionError(409, 'IMPACT_DECISION_CONFLICT', 'Concurrent work or a duplicate draft version requires a reload.');
    }
    throw error;
  });
}
