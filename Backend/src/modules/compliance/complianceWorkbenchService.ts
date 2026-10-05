import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import { InternalActor, InteractionError, internalCaseScope } from '../client-interaction/base';
import { getComplianceWorkspace } from './complianceWorkspaceService';
import { assertEvidenceDocumentAuthority } from './evidenceDocumentAuthority';
import { clientImpactContext, workbenchActor } from './complianceImpactDecisionService';

export interface WorkbenchRow {
  id: string;
  kind: 'MISSING_FACT' | 'SUBMISSION' | 'STALE_EVIDENCE' | 'PROPOSAL' | 'SOURCE_IMPACT';
  sourceId: string;
  requirementsTarget?: { clientId: string; applicabilityId: string; factKey: string };
  clientId: string;
  caseId: string | null;
  subject: string | null;
  title: string;
  status: string;
  since: string | null;
  dueAt: string | null;
  ownerId: string | null; ownerName?: string | null;
  readOnly: boolean;
  reason: string | null;
  action: 'REQUIREMENTS' | 'SUBMISSION_REVIEW' | 'EVIDENCE_REVIEW' | 'PROPOSAL_REVIEW' | 'SOURCE_REVIEW' | 'IMPACT_DECISION';
  source?: { observationId: string; legalSourceId: string; legalSourceVersionId: string; versionKey: string; sourceKey: string; event: string; reviewedNote: string | null; revision: string; requirementVersions: Array<{ id: string; title: string }>; proposals: Array<{ id: string; title: string }>; decision: { kind: string; note: string; decidedAt: string; result: { caseId?: string; taskId?: string; requirementVersionId?: string } } | null };
}
const LIMIT = 50;

export function missingFactWorkbenchRow(
  clientId: string,
  area: { applicabilityId: string; title: string; outcome: string; subjectLabel: string | null; evaluationAt: string },
  fact: { factKey: string; label: string | null },
): WorkbenchRow {
  const sourceId = `${area.applicabilityId}:${fact.factKey}`;
  return {
    id: `MISSING_FACT:${sourceId}`,
    kind: 'MISSING_FACT',
    sourceId,
    requirementsTarget: { clientId, applicabilityId: area.applicabilityId, factKey: fact.factKey },
    clientId,
    caseId: null,
    subject: area.subjectLabel,
    title: `${area.title} — ${fact.label || 'Ügyvédi pontosítás szükséges.'}`,
    status: area.outcome,
    since: area.evaluationAt,
    dueAt: null,
    ownerId: null,
    ownerName: null,
    readOnly: false,
    reason: null,
    action: 'REQUIREMENTS',
  };
}

/** Bounded display over canonical records. No writes, inferred owners or invented deadlines. */
export async function getClientComplianceWorkbench(actor: InternalActor, clientId: string, db: PrismaClient = defaultPrisma) {
  const trusted = await workbenchActor(actor, clientId, db);
  const scope = await internalCaseScope(trusted, db);
  const caseFilter = scope === null ? {} : { caseId: { in: scope } };
  const now = new Date();
  const [workspace, submissions, evidence, proposals, observations] = await Promise.all([
    getComplianceWorkspace(trusted, clientId, db),
    db.clientSubmission.findMany({ where: { clientId, caseId: { not: null }, ...caseFilter, complianceAcceptance: { equals: Prisma.DbNull }, status: { in: ['SUBMITTED', 'SCANNING', 'RECEIVED', 'UNDER_INTERNAL_REVIEW', 'CORRECTION_REQUESTED', 'ACCEPTED_INTO_MATTER'] } }, include: { request: { select: { clientSafeTitle: true, dueAt: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: LIMIT + 1 }),
    db.evidenceRecord.findMany({ where: { clientId, status: { not: 'REJECTED' }, OR: [{ validUntil: { lt: now } }, { status: { in: ['PROVIDED', 'UNDER_REVIEW'] } }] }, include: { clientFact: { select: { sourceDocumentVersionId: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: LIMIT + 1 }),
    db.complianceProposal.findMany({ where: { clientId, status: { in: ['PROPOSED', 'CONFIRMED'] }, AND: scope === null ? [] : [{ OR: [{ caseId: null }, { caseId: { in: scope } }] }], OR: [{ status: 'PROPOSED' }, { task: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }] }, include: { assignee: { select: { name: true } }, task: { select: { status: true } }, applicabilityAtProposal: { select: { requirementVersionId: true } } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: LIMIT + 1 }),
    // Restrict discovery to exact registry paths into this client before paging.
    db.legalSourceObservation.findMany({ where: { reviewStatus: { in: ['NEW', 'IN_REVIEW', 'IMPACT_CONFIRMED'] }, legalSource: { versions: { some: { OR: [
      { citations: { some: { requirementVersion: { applicabilitySnapshots: { some: { clientId } } } } } },
      { citations: { some: { requirementVersion: { controlMaps: { some: { controlDefinition: { clientControls: { some: { clientId } } } } } } } } },
      { clauseAnchors: { some: { documentVersion: { document: { clientId, ...caseFilter } } } } },
    ] } } } }, orderBy: [{ ingestedAt: 'desc' }, { id: 'asc' }], take: LIMIT + 1 }),
  ]);
  // Bounded typed acceptance choices from the SAME persisted missing-fact snapshots.
  // Complex/specialist facts keep their canonical expert workflow; never infer values.
  const acceptanceTargets = await db.factDefinition.findMany({ where: {
    key: { in: workspace.areas.filter(a => a.scopeType === 'COMPANY').flatMap(a => a.missingFacts.map(f => f.factKey)).slice(0, LIMIT) },
    status: 'ACTIVE', determinationMethod: 'USER_PROVIDED', temporalPolicy: 'VALIDITY_INTERVAL',
    valueType: { in: ['BOOLEAN', 'NUMBER', 'STRING'] }, allowedScopeTypes: { has: 'COMPANY' },
  }, select: { id: true, key: true, valueType: true }, take: LIMIT });
  const rows: WorkbenchRow[] = [];
  const base = (kind: WorkbenchRow['kind'], sourceId: string, title: string, status: string, action: WorkbenchRow['action']): WorkbenchRow => ({ id: `${kind}:${sourceId}`, kind, sourceId, clientId, title, status, action, caseId: null, subject: null, since: null, dueAt: null, ownerId: null, readOnly: false, reason: null });
  const missing = workspace.areas.flatMap(area => area.missingFacts.map(fact => ({ area, fact })));
  for (const { area, fact } of missing.slice(0, LIMIT)) rows.push(missingFactWorkbenchRow(clientId, area, fact));
  for (const s of submissions.slice(0, LIMIT)) rows.push({ ...base('SUBMISSION', s.id, s.request.clientSafeTitle, s.status, 'SUBMISSION_REVIEW'), caseId: s.caseId, since: (s.submittedAt ?? s.createdAt).toISOString(), dueAt: s.request.dueAt?.toISOString() ?? null, readOnly: s.status === 'CORRECTION_REQUESTED', reason: s.status === 'CORRECTION_REQUESTED' ? 'AWAITING_CUSTOMER_CORRECTION' : null });
  for (const e of evidence.slice(0, LIMIT)) {
    let caseId: string | null = null;
    try {
      for (const versionId of new Set([e.documentVersionId, e.clientFact?.sourceDocumentVersionId].filter((id): id is string => Boolean(id)))) {
        const version = await assertEvidenceDocumentAuthority(trusted, clientId, versionId, db, undefined, false);
        caseId = version.document.caseId;
      }
    } catch (error) { if (error instanceof InteractionError && error.status === 403) continue; throw error; }
    rows.push({ ...base('STALE_EVIDENCE', e.id, e.title, e.validUntil && e.validUntil < now ? `STALE:${e.status}` : e.status, 'EVIDENCE_REVIEW'), caseId, since: e.createdAt.toISOString(), dueAt: e.validUntil?.toISOString() ?? null });
  }
  for (const p of proposals.slice(0, LIMIT)) rows.push({ ...base('PROPOSAL', p.id, p.title, p.task ? `${p.status}:${p.task.status}` : p.status, 'PROPOSAL_REVIEW'), caseId: p.caseId, since: p.createdAt.toISOString(), dueAt: p.deadline?.toISOString() ?? null, ownerId: p.assigneeId, ownerName: p.assignee?.name ?? null });
  for (const o of observations.slice(0, LIMIT)) {
    try {
      const ctx = await clientImpactContext(trusted, clientId, o.id, db, false);
      const decision = await db.complianceImpactDecision.findUnique({ where: { clientId_observationId_sourceRevision: { clientId, observationId: o.id, sourceRevision: ctx.sourceRevision } } });
      const affected = ctx.impact.requirementImpact.citations;
      rows.push({ ...base('SOURCE_IMPACT', o.id, ctx.impact.subject!.title || ctx.impact.subject!.sourceKey, decision ? `DECIDED:${decision.kind}` : o.reviewStatus, o.reviewStatus === 'IMPACT_CONFIRMED' ? 'IMPACT_DECISION' : 'SOURCE_REVIEW'), since: o.ingestedAt.toISOString(), readOnly: Boolean(decision), reason: decision ? 'DECISION_RECORDED' : null,
        source: { observationId: o.id, legalSourceId: ctx.version.legalSourceId, legalSourceVersionId: ctx.version.id, versionKey: ctx.version.legalVersionKey, sourceKey: ctx.impact.subject!.sourceKey, event: o.relatedIdentifier, reviewedNote: o.decisionNote, revision: ctx.sourceRevision,
          requirementVersions: affected.map(c => ({ id: c.requirementVersionId, title: c.versionTitle })).filter((v, i, all) => all.findIndex(x => x.id === v.id) === i),
          proposals: proposals.filter(p => p.proposalKind === 'REMEDIATION' && affected.some(c => c.requirementVersionId === p.applicabilityAtProposal.requirementVersionId)).map(p => ({ id: p.id, title: p.title })),
          decision: decision ? { kind: decision.kind, note: decision.note, decidedAt: decision.decidedAt.toISOString(), result: decision.result as { caseId?: string; taskId?: string; requirementVersionId?: string } } : null } });
    } catch (error) {
      if (error instanceof InteractionError && ['IMPACT_CLIENT_NOT_LINKED', 'OBSERVATION_IMPACT_VERSION_UNAVAILABLE', 'OBSERVATION_IMPACT_VERSION_AMBIGUOUS'].includes(error.code)) continue;
      throw error;
    }
  }
  return { schemaVersion: 1, clientId, generatedAt: now.toISOString(), rows, acceptanceTargets, limitPerKind: LIMIT,
    truncated: { missingFacts: missing.length > LIMIT, submissions: submissions.length > LIMIT, evidence: evidence.length > LIMIT, proposals: proposals.length > LIMIT, observations: observations.length > LIMIT } };
}
