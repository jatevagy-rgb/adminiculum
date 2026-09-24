/**
 * C4D — office-wide Compliance Center read model (INTERNAL, read-only, derived).
 *
 * This is a bounded, office-wide projection over the EXISTING canonical
 * compliance relations. It exists so the frontend does not re-derive
 * cross-client joins in React. It performs no writes: no finding, proposal,
 * case, task, control or evidence mutation, no legal-source mutation, no
 * background job, no persisted work queue.
 *
 * AUTHORIZATION — fail closed. The actor's canonical case scope
 * (`internalCaseScope`) governs which clients are visible; ADMIN/PARTNER are
 * unscoped. Document-level impact is not re-derived here: the frontend reuses
 * the existing legal-source-impact route for exact-version drilldown.
 *
 * TRUTHFULNESS — "review required" is a human/legal review signal derived from
 * the persisted registry review status and from expired evidence / due control
 * reviews. It never marks a client non-compliant, never implies an external
 * legal-source watcher ran, and never fabricates a compliance score.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  InternalActor,
  internalCaseScope,
  requireInternal,
} from '../client-interaction/base';

type Prisma = typeof defaultPrisma;

export const COMPLIANCE_CENTER_SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ */
/*  DTOs                                                               */
/* ------------------------------------------------------------------ */

export interface OfficeClientRow {
  clientId: string;
  clientName: string;
  openFindings: number;
  staleEvidence: number;
  controlsNeedingReview: number;
}

export interface OfficeLegalSourceReviewSignal {
  legalSourceId: string;
  legalSourceVersionId: string;
  sourceKey: string;
  canonicalCitation: string | null;
  title: string | null;
  versionLabel: string | null;
  versionStatus: string;
  reviewStatus: string;
  sourceStatus: string;
  /** True when the persisted registry/version review state signals review. */
  reviewRequired: boolean;
  impactedRequirementCount: number;
  impactedClientCount: number;
  impactedDocumentCount: number;
}

export interface OfficeReviewWorkItem {
  kind: 'FINDING' | 'STALE_EVIDENCE' | 'CONTROL_REVIEW';
  clientId: string;
  clientName: string;
  refId: string;
  title: string;
  dueAt: string | null;
}

export interface ComplianceCenterOverview {
  schemaVersion: number;
  generatedAt: string;
  summary: {
    clientsWithOpenWork: number;
    openFindings: number;
    staleEvidence: number;
    controlsNeedingReview: number;
    legalSourcesReviewRequired: number;
  };
  clients: OfficeClientRow[];
  legalSources: OfficeLegalSourceReviewSignal[];
  reviewWork: OfficeReviewWorkItem[];
}

/* ------------------------------------------------------------------ */
/*  Scope resolution                                                   */
/* ------------------------------------------------------------------ */

/**
 * Resolve the CLIENT read scope for office-wide aggregation. Reuses the
 * canonical `internalCaseScope` (ADMIN/PARTNER → null = all clients; other
 * roles → the clients of their readable cases). `null` means unscoped.
 */
async function resolveOfficeClientScope(
  actor: InternalActor,
  prisma: Prisma,
): Promise<string[] | null> {
  requireInternal(actor);
  const readableCases = await internalCaseScope(actor, prisma);
  if (readableCases === null) return null;
  if (readableCases.length === 0) return [];
  const rows = await prisma.case.findMany({
    where: { id: { in: readableCases } },
    select: { clientId: true },
    distinct: ['clientId'],
  });
  return [...new Set(rows.map((row) => row.clientId))];
}

function clientWhere(clientScope: string[] | null): { clientId?: { in: string[] } } {
  return clientScope === null ? {} : { clientId: { in: clientScope } };
}

function clientModelWhere(clientScope: string[] | null): { id?: { in: string[] } } {
  return clientScope === null ? {} : { id: { in: clientScope } };
}

/* ------------------------------------------------------------------ */
/*  Reader                                                             */
/* ------------------------------------------------------------------ */

export async function getComplianceCenterOverview(
  actor: InternalActor,
  prisma: PrismaClient = defaultPrisma,
  generatedAt: string = new Date().toISOString(),
): Promise<ComplianceCenterOverview> {
  const clientScope = await resolveOfficeClientScope(actor, prisma as Prisma);
  const now = new Date();

  const [findings, staleEvidence, controlsDue, clients] = await Promise.all([
    prisma.assessmentFinding.findMany({
      where: { status: { not: 'RESOLVED' }, ...clientWhere(clientScope) },
      select: { id: true, clientId: true, title: true, createdAt: true },
    }),
    prisma.evidenceRecord.findMany({
      where: {
        validUntil: { lt: now },
        status: { not: 'REJECTED' },
        ...clientWhere(clientScope),
      },
      select: { id: true, clientId: true, title: true, validUntil: true },
    }),
    prisma.clientControl.findMany({
      where: { nextReviewAt: { lte: now }, ...clientWhere(clientScope) },
      select: { id: true, clientId: true, controlDefinition: { select: { title: true } }, nextReviewAt: true },
    }),
    prisma.client.findMany({
      where: clientModelWhere(clientScope),
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }],
    }),
  ]);

  // Per-client aggregates.
  const rows = new Map<string, OfficeClientRow>();
  const ensure = (clientId: string, clientName?: string | null): OfficeClientRow => {
    const existing = rows.get(clientId);
    if (existing) return existing;
    const created: OfficeClientRow = {
      clientId,
      clientName: clientName ?? clientId,
      openFindings: 0,
      staleEvidence: 0,
      controlsNeedingReview: 0,
    };
    rows.set(clientId, created);
    return created;
  };
  for (const client of clients) ensure(client.id, client.name);
  for (const finding of findings) ensure(finding.clientId).openFindings += 1;
  for (const evidence of staleEvidence) ensure(evidence.clientId).staleEvidence += 1;
  for (const control of controlsDue) ensure(control.clientId).controlsNeedingReview += 1;

  // Legal-source review signals: registry/version review state signals review,
  // never an automatic non-compliance conclusion.
  const legalSourceVersions = await prisma.legalSourceVersion.findMany({
    select: {
      id: true,
      legalSourceId: true,
      legalVersionKey: true,
      versionLabel: true,
      status: true,
      reviewStatus: true,
      legalSource: {
        select: { sourceKey: true, canonicalCitation: true, title: true, status: true },
      },
      citations: {
        select: { requirementVersionId: true },
      },
      clauseAnchors: {
        select: { documentVersion: { select: { document: { select: { clientId: true } } } } },
      },
    },
    orderBy: [{ legalSource: { sourceKey: 'asc' } }, { legalVersionKey: 'asc' }],
  });

  const legalSources: OfficeLegalSourceReviewSignal[] = legalSourceVersions.map((version) => {
    const requirementVersionIds = new Set(version.citations.map((citation) => citation.requirementVersionId));
    const anchorClients = new Set(
      version.clauseAnchors
        .map((anchor) => anchor.documentVersion.document.clientId)
        .filter((id): id is string => Boolean(id)),
    );

    // Client-level impact is scoped to the actor's readable clients.
    const impactedClients = new Set<string>();
    if (clientScope === null) {
      for (const id of anchorClients) impactedClients.add(id);
    } else {
      const allowed = new Set(clientScope);
      for (const id of anchorClients) if (allowed.has(id)) impactedClients.add(id);
    }

    const reviewRequired =
      String(version.reviewStatus) !== 'APPROVED' || String(version.legalSource.status) === 'LEGAL_REVIEW_REQUIRED';

    return {
      legalSourceId: version.legalSourceId,
      legalSourceVersionId: version.id,
      sourceKey: version.legalSource.sourceKey,
      canonicalCitation: version.legalSource.canonicalCitation ?? null,
      title: version.legalSource.title ?? null,
      versionLabel: version.versionLabel ?? null,
      versionStatus: String(version.status),
      reviewStatus: String(version.reviewStatus),
      sourceStatus: String(version.legalSource.status),
      reviewRequired,
      impactedRequirementCount: requirementVersionIds.size,
      impactedClientCount: impactedClients.size,
      impactedDocumentCount: version.clauseAnchors.length,
    };
  });

  // Derived review workload — read-only. Never a persisted assignment queue.
  const reviewWork: OfficeReviewWorkItem[] = [
    ...findings.map((finding) => ({
      kind: 'FINDING' as const,
      clientId: finding.clientId,
      clientName: rows.get(finding.clientId)?.clientName ?? finding.clientId,
      refId: finding.id,
      title: finding.title,
      dueAt: finding.createdAt.toISOString(),
    })),
    ...staleEvidence.map((evidence) => ({
      kind: 'STALE_EVIDENCE' as const,
      clientId: evidence.clientId,
      clientName: rows.get(evidence.clientId)?.clientName ?? evidence.clientId,
      refId: evidence.id,
      title: evidence.title,
      dueAt: evidence.validUntil?.toISOString() ?? null,
    })),
    ...controlsDue.map((control) => ({
      kind: 'CONTROL_REVIEW' as const,
      clientId: control.clientId,
      clientName: rows.get(control.clientId)?.clientName ?? control.clientId,
      refId: control.id,
      title: control.controlDefinition.title,
      dueAt: control.nextReviewAt?.toISOString() ?? null,
    })),
  ].sort((a, b) => (a.clientName.localeCompare(b.clientName)) || (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));

  const clientList = [...rows.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));

  return {
    schemaVersion: COMPLIANCE_CENTER_SCHEMA_VERSION,
    generatedAt,
    summary: {
      clientsWithOpenWork: clientList.filter(
        (row) => row.openFindings > 0 || row.staleEvidence > 0 || row.controlsNeedingReview > 0,
      ).length,
      openFindings: findings.length,
      staleEvidence: staleEvidence.length,
      controlsNeedingReview: controlsDue.length,
      legalSourcesReviewRequired: legalSources.filter((source) => source.reviewRequired).length,
    },
    clients: clientList,
    legalSources,
    reviewWork,
  };
}


