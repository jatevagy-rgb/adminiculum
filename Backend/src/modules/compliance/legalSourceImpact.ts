/**
 * C4C — read-only legal-source IMPACT projection (internal only).
 *
 * Answers, from the EXISTING canonical persisted relations and from nothing else:
 *
 *   LEGAL CHANGE
 *     → canonical legal reference (LegalSourceVersion / C4A reference)
 *       → impacted customer documents          (exact clause anchor)
 *       → impacted RequirementVersions         (exact RequirementCitation)
 *         → impacted RequirementControlMaps    (exact map)
 *           → impacted ControlDefinitions
 *             → existing ClientControls
 *       → impacted clients                     (exact RequirementApplicability
 *                                               or exact document anchor)
 *       → REVIEW ATTENTION (signal only)
 *
 * OWNERSHIP: this read model lives in the compliance module because it traverses
 * the Requirement / Control / Applicability graph owned here. It READS the
 * clause-anchor relation owned by compliance-doc-intelligence (CDI) through its
 * canonical fields only; it performs no writes at all. Keeping the cross-domain
 * reader out of the CDI ingestion directory preserves the C3A write-boundary
 * guard that applies to that directory.
 *
 * HARD RULES ENCODED HERE
 * - EXACT ONLY. Every edge is followed through a persisted foreign key or an
 *   exact canonical-reference anchor key. There is deliberately NO title match,
 *   NO free-text match, NO semantic similarity, NO fuzzy identifier repair. When
 *   no exact canonical path exists the section reports `derivable: false`; it
 *   never guesses.
 * - READ-ONLY. This module performs no writes at all: no LegalSource /
 *   LegalSourceVersion / RequirementCitation / ComplianceDocumentClauseAnchor /
 *   ClientControl / AssessmentFinding / ComplianceProposal / Task mutation, no
 *   storage, no migration, no background job.
 * - REVIEW, NOT NON-COMPLIANCE. A legal change means "review required". Nothing
 *   here marks a client non-compliant, changes an implementation state or opens a
 *   finding, proposal, case or task. `automaticActionsCreated` is always 0.
 * - The three client-impact kinds stay SEPARATE (DOCUMENT_REFERENCE_IMPACT,
 *   APPLICABILITY_IMPACT, CONTROL_IMPACT). They are never collapsed into one
 *   number.
 * - The projection is INTERNAL. It carries internal identifiers (clientId,
 *   documentId, requirement keys, anchor-derived canonical references). It must
 *   never be projected through a customer surface: the customer later sees only
 *   approved client-safe Compliance output.
 * - The select lists never read raw document content, rationale, ELI / CELEX /
 *   ECLI, row digests or parser warnings.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../prisma/prisma.service';
import {
  CANONICAL_REFERENCE_ANCHOR_KEY_PREFIX,
  canonicalReferenceFromAnchorKey,
  parseCanonicalLegalReference,
} from '../compliance-doc-intelligence/canonicalLegalReference';

export const LEGAL_SOURCE_IMPACT_SCHEMA_VERSION = 1;

/** The three client-impact kinds. Deliberately distinct and never collapsed. */
export type LegalSourceImpactKind =
  | 'DOCUMENT_REFERENCE_IMPACT'
  | 'APPLICABILITY_IMPACT'
  | 'CONTROL_IMPACT';

/** Why a section cannot be derived. Never a substitute for a guess. */
export type LegalSourceImpactUnavailableReason =
  | 'NO_CANONICAL_REGISTRY_BINDING';

export type LegalSourceImpactSubjectType = 'LEGAL_SOURCE_VERSION' | 'CANONICAL_REFERENCE';

/* ------------------------------------------------------------------ */
/*  Raw read shapes — exactly the fields the projection is allowed to  */
/*  use. No raw document content, rationale or identifier metadata.    */
/* ------------------------------------------------------------------ */

export interface ImpactDocumentReferenceRow {
  documentVersionId: string;
  clauseRef: string;
  clauseTitle: string | null;
  anchorType: string;
  relationType: string;
  anchorKey: string | null;
  documentVersion: {
    version: number;
    isCurrent: boolean;
    document: {
      id: string;
      name: string;
      clientId: string;
      client: { id: string; name: string };
    };
  };
}

export interface ImpactCitationRow {
  id: string;
  requirementVersionId: string;
  supportRole: string;
  locator: string | null;
  requirementVersion: {
    id: string;
    requirementId: string;
    versionKey: string;
    title: string;
    status: string;
    requirement: {
      id: string;
      key: string;
      domainCode: string;
      status: string;
    };
  };
}

export interface ImpactControlMapRow {
  id: string;
  requirementVersionId: string;
  controlDefinitionId: string;
  controlDefinition: {
    id: string;
    key: string;
    title: string;
    type: string;
    status: string;
  };
}

export interface ImpactClientControlRow {
  id: string;
  clientId: string;
  controlDefinitionId: string;
  implementationStatus: string;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
}

export interface ImpactApplicabilityRow {
  id: string;
  clientId: string;
  requirementVersionId: string;
  outcome: string;
  scopeType: string;
  evaluationAt: Date;
}

export interface ImpactClientRow {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Projected DTOs                                                     */
/* ------------------------------------------------------------------ */

export interface DocumentReferenceImpact {
  kind: 'DOCUMENT_REFERENCE_IMPACT';
  references: Array<{
    clientId: string;
    clientName: string;
    documentId: string;
    documentName: string;
    documentVersionId: string;
    version: number;
    isCurrent: boolean;
    clauseRef: string;
    clauseTitle: string | null;
    anchorType: string;
    relationType: string;
    /** Derived from the persisted anchor key; never invented. */
    canonicalReference: string | null;
  }>;
  totals: {
    references: number;
    documents: number;
    documentVersions: number;
    clients: number;
  };
}

export interface RequirementImpact {
  kind: 'REQUIREMENT_IMPACT';
  derivable: boolean;
  unavailableReason: LegalSourceImpactUnavailableReason | null;
  citations: Array<{
    citationId: string;
    requirementVersionId: string;
    requirementId: string;
    requirementKey: string;
    requirementStatus: string;
    versionKey: string;
    versionTitle: string;
    versionStatus: string;
    supportRole: string;
    citationLocator: string | null;
  }>;
  requirements: Array<{
    requirementId: string;
    requirementKey: string;
    domainCode: string;
    status: string;
  }>;
  totals: {
    citations: number;
    requirementVersions: number;
    requirements: number;
  };
}

export interface ControlImpact {
  kind: 'CONTROL_IMPACT';
  derivable: boolean;
  unavailableReason: LegalSourceImpactUnavailableReason | null;
  controlDefinitions: Array<{
    controlDefinitionId: string;
    controlKey: string;
    title: string;
    type: string;
    status: string;
    viaRequirementVersionIds: string[];
  }>;
  clientControls: Array<{
    clientControlId: string;
    clientId: string;
    controlDefinitionId: string;
    implementationStatus: string;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
  }>;
  totals: {
    controlDefinitions: number;
    clientControls: number;
    clients: number;
  };
}

export interface ApplicabilityImpact {
  kind: 'APPLICABILITY_IMPACT';
  derivable: boolean;
  unavailableReason: LegalSourceImpactUnavailableReason | null;
  applicabilities: Array<{
    applicabilityId: string;
    clientId: string;
    requirementVersionId: string;
    outcome: string;
    scopeType: string;
    evaluationAt: string;
  }>;
  totals: {
    applicabilities: number;
    clients: number;
  };
}

export interface ClientImpactEntry {
  clientId: string;
  clientName: string | null;
  /** Which exact persisted impact paths exist for this client. */
  impactKinds: LegalSourceImpactKind[];
  documentReferenceCount: number;
  applicabilityCount: number;
  clientControlCount: number;
}

export interface LegalSourceImpactReviewSignal {
  reviewRequired: boolean;
  /** A legal change with an exact citation is already review-worthy. */
  requirementCitationPresent: boolean;
  basis: LegalSourceImpactKind[];
  /** This projection never opens findings, proposals, cases or tasks. */
  automaticActionsCreated: 0;
  note: 'LEGAL_CHANGE_MEANS_REVIEW_REQUIRED_NOT_NON_COMPLIANCE';
}

export interface LegalSourceImpactSubject {
  legalSourceVersionId: string;
  legalSourceId: string;
  sourceKey: string;
  canonicalCitation: string | null;
  title: string | null;
}

export interface LegalSourceImpactProjection {
  schemaVersion: number;
  generatedAt: string;
  subjectType: LegalSourceImpactSubjectType;
  /** Present only for a registry-bound subject. */
  subject: LegalSourceImpactSubject | null;
  /** Present only for a canonical-reference subject. */
  canonicalReference: string | null;
  documentReferenceImpact: DocumentReferenceImpact;
  requirementImpact: RequirementImpact;
  controlImpact: ControlImpact;
  applicabilityImpact: ApplicabilityImpact;
  clients: ClientImpactEntry[];
  review: LegalSourceImpactReviewSignal;
}

/* ------------------------------------------------------------------ */
/*  Pure projections (no database, no writes)                          */
/* ------------------------------------------------------------------ */

export function projectDocumentReferenceImpact(
  rows: readonly ImpactDocumentReferenceRow[],
): DocumentReferenceImpact {
  const references = rows
    .map((row) => ({
      clientId: row.documentVersion.document.client.id,
      clientName: row.documentVersion.document.client.name,
      documentId: row.documentVersion.document.id,
      documentName: row.documentVersion.document.name,
      documentVersionId: row.documentVersionId,
      version: row.documentVersion.version,
      isCurrent: row.documentVersion.isCurrent,
      clauseRef: row.clauseRef,
      clauseTitle: row.clauseTitle,
      anchorType: row.anchorType,
      relationType: row.relationType,
      canonicalReference: canonicalReferenceFromAnchorKey(row.anchorKey),
    }))
    .sort(
      (a, b) =>
        a.clientId.localeCompare(b.clientId) ||
        a.documentId.localeCompare(b.documentId) ||
        a.documentVersionId.localeCompare(b.documentVersionId) ||
        a.clauseRef.localeCompare(b.clauseRef) ||
        (a.canonicalReference ?? '').localeCompare(b.canonicalReference ?? '') ||
        a.anchorType.localeCompare(b.anchorType) ||
        a.relationType.localeCompare(b.relationType),
    );

  return {
    kind: 'DOCUMENT_REFERENCE_IMPACT',
    references,
    totals: {
      references: references.length,
      documents: new Set(references.map((reference) => reference.documentId)).size,
      documentVersions: new Set(references.map((reference) => reference.documentVersionId)).size,
      clients: new Set(references.map((reference) => reference.clientId)).size,
    },
  };
}

export function projectRequirementImpact(
  citations: readonly ImpactCitationRow[],
  derivable: boolean,
): RequirementImpact {
  const projected = citations
    .map((citation) => ({
      citationId: citation.id,
      requirementVersionId: citation.requirementVersion.id,
      requirementId: citation.requirementVersion.requirement.id,
      requirementKey: citation.requirementVersion.requirement.key,
      requirementStatus: citation.requirementVersion.requirement.status,
      versionKey: citation.requirementVersion.versionKey,
      versionTitle: citation.requirementVersion.title,
      versionStatus: citation.requirementVersion.status,
      supportRole: citation.supportRole,
      citationLocator: citation.locator,
    }))
    .sort(
      (a, b) =>
        a.requirementKey.localeCompare(b.requirementKey) ||
        a.versionKey.localeCompare(b.versionKey) ||
        a.supportRole.localeCompare(b.supportRole) ||
        a.citationId.localeCompare(b.citationId),
    );

  const requirements = [
    ...new Map(
      citations.map((citation) => [
        citation.requirementVersion.requirement.id,
        {
          requirementId: citation.requirementVersion.requirement.id,
          requirementKey: citation.requirementVersion.requirement.key,
          domainCode: citation.requirementVersion.requirement.domainCode,
          status: citation.requirementVersion.requirement.status,
        },
      ]),
    ).values(),
  ].sort((a, b) => a.requirementKey.localeCompare(b.requirementKey));

  return {
    kind: 'REQUIREMENT_IMPACT',
    derivable,
    unavailableReason: derivable ? null : 'NO_CANONICAL_REGISTRY_BINDING',
    citations: projected,
    requirements,
    totals: {
      citations: projected.length,
      requirementVersions: new Set(projected.map((citation) => citation.requirementVersionId)).size,
      requirements: requirements.length,
    },
  };
}

export function projectControlImpact(
  controlMaps: readonly ImpactControlMapRow[],
  clientControls: readonly ImpactClientControlRow[],
  derivable: boolean,
): ControlImpact {
  const byDefinition = new Map<
    string,
    {
      controlDefinitionId: string;
      controlKey: string;
      title: string;
      type: string;
      status: string;
      viaRequirementVersionIds: Set<string>;
    }
  >();

  for (const map of controlMaps) {
    const definition = map.controlDefinition;
    const entry = byDefinition.get(definition.id) ?? {
      controlDefinitionId: definition.id,
      controlKey: definition.key,
      title: definition.title,
      type: definition.type,
      status: definition.status,
      viaRequirementVersionIds: new Set<string>(),
    };
    entry.viaRequirementVersionIds.add(map.requirementVersionId);
    byDefinition.set(definition.id, entry);
  }

  const controlDefinitions = [...byDefinition.values()]
    .map((entry) => ({
      controlDefinitionId: entry.controlDefinitionId,
      controlKey: entry.controlKey,
      title: entry.title,
      type: entry.type,
      status: entry.status,
      viaRequirementVersionIds: [...entry.viaRequirementVersionIds].sort(),
    }))
    .sort((a, b) => a.controlKey.localeCompare(b.controlKey));

  const projectedClientControls = clientControls
    // Only controls reached through an EXACT requirement-control map are claimed.
    .filter((clientControl) => byDefinition.has(clientControl.controlDefinitionId))
    .map((clientControl) => ({
      clientControlId: clientControl.id,
      clientId: clientControl.clientId,
      controlDefinitionId: clientControl.controlDefinitionId,
      implementationStatus: clientControl.implementationStatus,
      lastReviewedAt: clientControl.lastReviewedAt ? clientControl.lastReviewedAt.toISOString() : null,
      nextReviewAt: clientControl.nextReviewAt ? clientControl.nextReviewAt.toISOString() : null,
    }))
    .sort(
      (a, b) =>
        a.clientId.localeCompare(b.clientId) ||
        a.controlDefinitionId.localeCompare(b.controlDefinitionId) ||
        a.clientControlId.localeCompare(b.clientControlId),
    );

  return {
    kind: 'CONTROL_IMPACT',
    derivable,
    unavailableReason: derivable ? null : 'NO_CANONICAL_REGISTRY_BINDING',
    controlDefinitions,
    clientControls: projectedClientControls,
    totals: {
      controlDefinitions: controlDefinitions.length,
      clientControls: projectedClientControls.length,
      clients: new Set(projectedClientControls.map((clientControl) => clientControl.clientId)).size,
    },
  };
}

export function projectApplicabilityImpact(
  requirementVersionIds: readonly string[],
  applicabilities: readonly ImpactApplicabilityRow[],
  derivable: boolean,
): ApplicabilityImpact {
  const allowed = new Set(requirementVersionIds);
  const projected = applicabilities
    // Only applicability snapshots of an EXACTLY impacted RequirementVersion.
    .filter((applicability) => allowed.has(applicability.requirementVersionId))
    .map((applicability) => ({
      applicabilityId: applicability.id,
      clientId: applicability.clientId,
      requirementVersionId: applicability.requirementVersionId,
      outcome: applicability.outcome,
      scopeType: applicability.scopeType,
      evaluationAt: applicability.evaluationAt.toISOString(),
    }))
    .sort(
      (a, b) =>
        a.clientId.localeCompare(b.clientId) ||
        a.requirementVersionId.localeCompare(b.requirementVersionId) ||
        a.applicabilityId.localeCompare(b.applicabilityId),
    );

  return {
    kind: 'APPLICABILITY_IMPACT',
    derivable,
    unavailableReason: derivable ? null : 'NO_CANONICAL_REGISTRY_BINDING',
    applicabilities: projected,
    totals: {
      applicabilities: projected.length,
      clients: new Set(projected.map((applicability) => applicability.clientId)).size,
    },
  };
}

export function projectClientImpact(input: {
  documentReferences: readonly ImpactDocumentReferenceRow[];
  applicabilities: readonly ImpactApplicabilityRow[];
  clientControls: readonly ImpactClientControlRow[];
  /** Only the controls reached through an exact requirement-control map. */
  impactedControlDefinitionIds: readonly string[];
  clients: readonly ImpactClientRow[];
}): ClientImpactEntry[] {
  const impactedControls = new Set(input.impactedControlDefinitionIds);
  const entries = new Map<
    string,
    {
      clientId: string;
      clientName: string | null;
      documentReferenceCount: number;
      applicabilityCount: number;
      clientControlCount: number;
    }
  >();

  const ensure = (clientId: string, clientName?: string | null) => {
    const existing = entries.get(clientId);
    if (existing) {
      if (!existing.clientName && clientName) existing.clientName = clientName;
      return existing;
    }
    const created = {
      clientId,
      clientName: clientName ?? null,
      documentReferenceCount: 0,
      applicabilityCount: 0,
      clientControlCount: 0,
    };
    entries.set(clientId, created);
    return created;
  };

  for (const reference of input.documentReferences) {
    const client = reference.documentVersion.document.client;
    ensure(client.id, client.name).documentReferenceCount += 1;
  }
  for (const applicability of input.applicabilities) {
    ensure(applicability.clientId).applicabilityCount += 1;
  }
  for (const clientControl of input.clientControls) {
    if (!impactedControls.has(clientControl.controlDefinitionId)) continue;
    ensure(clientControl.clientId).clientControlCount += 1;
  }
  for (const client of input.clients) {
    ensure(client.id, client.name);
  }

  return [...entries.values()]
    .map((entry) => {
      const impactKinds: LegalSourceImpactKind[] = [];
      if (entry.documentReferenceCount > 0) impactKinds.push('DOCUMENT_REFERENCE_IMPACT');
      if (entry.applicabilityCount > 0) impactKinds.push('APPLICABILITY_IMPACT');
      if (entry.clientControlCount > 0) impactKinds.push('CONTROL_IMPACT');
      return {
        clientId: entry.clientId,
        clientName: entry.clientName,
        impactKinds,
        documentReferenceCount: entry.documentReferenceCount,
        applicabilityCount: entry.applicabilityCount,
        clientControlCount: entry.clientControlCount,
      };
    })
    .sort(
      (a, b) =>
        (a.clientName ?? '').localeCompare(b.clientName ?? '') || a.clientId.localeCompare(b.clientId),
    );
}

export interface LegalSourceImpactAssemblyInput {
  subjectType: LegalSourceImpactSubjectType;
  subject: LegalSourceImpactSubject | null;
  canonicalReference: string | null;
  documentReferences: readonly ImpactDocumentReferenceRow[];
  citations: readonly ImpactCitationRow[];
  controlMaps: readonly ImpactControlMapRow[];
  clientControls: readonly ImpactClientControlRow[];
  applicabilities: readonly ImpactApplicabilityRow[];
  clients: readonly ImpactClientRow[];
  requirementDerivable: boolean;
  generatedAt: string;
}

/**
 * Pure assembly of the full projection from already-read rows. Keeping this
 * separate from the readers makes the impact claims provable without a database.
 */
export function assembleLegalSourceImpact(
  input: LegalSourceImpactAssemblyInput,
): LegalSourceImpactProjection {
  const documentReferenceImpact = projectDocumentReferenceImpact(input.documentReferences);
  const requirementImpact = projectRequirementImpact(input.citations, input.requirementDerivable);
  const controlImpact = projectControlImpact(input.controlMaps, input.clientControls, input.requirementDerivable);
  const applicabilityImpact = projectApplicabilityImpact(
    input.citations.map((citation) => citation.requirementVersion.id),
    input.applicabilities,
    input.requirementDerivable,
  );

  const basis: LegalSourceImpactKind[] = [];
  if (documentReferenceImpact.totals.references > 0) basis.push('DOCUMENT_REFERENCE_IMPACT');
  if (applicabilityImpact.totals.applicabilities > 0) basis.push('APPLICABILITY_IMPACT');
  if (controlImpact.totals.clientControls > 0) basis.push('CONTROL_IMPACT');

  return {
    schemaVersion: LEGAL_SOURCE_IMPACT_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    subjectType: input.subjectType,
    subject: input.subject,
    canonicalReference: input.canonicalReference,
    documentReferenceImpact,
    requirementImpact,
    controlImpact,
    applicabilityImpact,
    clients: projectClientImpact({
      documentReferences: input.documentReferences,
      applicabilities: input.applicabilities,
      clientControls: input.clientControls,
      impactedControlDefinitionIds: controlImpact.controlDefinitions.map(
        (definition) => definition.controlDefinitionId,
      ),
      clients: input.clients,
    }),
    review: {
      reviewRequired: requirementImpact.totals.citations > 0 || basis.length > 0,
      requirementCitationPresent: requirementImpact.totals.citations > 0,
      basis,
      automaticActionsCreated: 0,
      note: 'LEGAL_CHANGE_MEANS_REVIEW_REQUIRED_NOT_NON_COMPLIANCE',
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Read-only readers                                                  */
/* ------------------------------------------------------------------ */

const DOCUMENT_REFERENCE_SELECT = {
  documentVersionId: true,
  clauseRef: true,
  clauseTitle: true,
  anchorType: true,
  relationType: true,
  anchorKey: true,
  documentVersion: {
    select: {
      version: true,
      isCurrent: true,
      document: {
        select: {
          id: true,
          name: true,
          clientId: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;

const CITATION_SELECT = {
  id: true,
  requirementVersionId: true,
  supportRole: true,
  locator: true,
  requirementVersion: {
    select: {
      id: true,
      requirementId: true,
      versionKey: true,
      title: true,
      status: true,
      requirement: {
        select: { id: true, key: true, domainCode: true, status: true },
      },
    },
  },
} as const;

async function readClientNames(
  prisma: PrismaClient,
  clientIds: readonly string[],
): Promise<ImpactClientRow[]> {
  const unique = [...new Set(clientIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const rows = await prisma.client.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return rows as ImpactClientRow[];
}

/**
 * Full internal impact projection for ONE canonical registry version.
 *
 * Returns null when the LegalSourceVersion does not exist, so a caller can
 * answer 404 instead of inventing an empty-but-valid subject.
 *
 * `allowedClientIds` is the caller's internal client-read scope:
 *  - null  → unscoped (ADMIN / PARTNER, or a trusted system caller);
 *  - a set → only client-identifying rows of those clients are read/returned.
 * The legal-source / requirement / control structure is not client-scoped and is
 * always reported; only the client-bearing impact rows are filtered.
 */
export async function buildLegalSourceImpactForVersion(
  legalSourceVersionId: string,
  prisma: PrismaClient = defaultPrisma,
  allowedClientIds: ReadonlySet<string> | null = null,
  generatedAt: string = new Date().toISOString(),
): Promise<LegalSourceImpactProjection | null> {
  const scopedClientIds = allowedClientIds ? [...allowedClientIds] : null;
  const clientScopeWhere = scopedClientIds ? { clientId: { in: scopedClientIds } } : {};

  const subjectRow = await prisma.legalSourceVersion.findUnique({
    where: { id: legalSourceVersionId },
    select: {
      id: true,
      legalSourceId: true,
      legalSource: { select: { id: true, sourceKey: true, canonicalCitation: true, title: true } },
    },
  });
  if (!subjectRow) return null;

  const documentReferences = (await prisma.complianceDocumentClauseAnchor.findMany({
    where: {
      legalSourceVersionId,
      ...(scopedClientIds
        ? { documentVersion: { document: { clientId: { in: scopedClientIds } } } }
        : {}),
    },
    select: DOCUMENT_REFERENCE_SELECT,
  })) as unknown as ImpactDocumentReferenceRow[];

  const citations = (await prisma.requirementCitation.findMany({
    where: { legalSourceVersionId },
    select: CITATION_SELECT,
  })) as unknown as ImpactCitationRow[];

  const requirementVersionIds = [
    ...new Set(citations.map((citation) => citation.requirementVersion.id)),
  ];

  const controlMaps = requirementVersionIds.length
    ? ((await prisma.requirementControlMap.findMany({
        where: { requirementVersionId: { in: requirementVersionIds } },
        select: {
          id: true,
          requirementVersionId: true,
          controlDefinitionId: true,
          controlDefinition: {
            select: { id: true, key: true, title: true, type: true, status: true },
          },
        },
      })) as unknown as ImpactControlMapRow[])
    : [];

  const controlDefinitionIds = [...new Set(controlMaps.map((map) => map.controlDefinitionId))];

  const [clientControls, applicabilities] = await Promise.all([
    controlDefinitionIds.length
      ? ((await prisma.clientControl.findMany({
          where: { controlDefinitionId: { in: controlDefinitionIds }, ...clientScopeWhere },
          select: {
            id: true,
            clientId: true,
            controlDefinitionId: true,
            implementationStatus: true,
            lastReviewedAt: true,
            nextReviewAt: true,
          },
        })) as unknown as ImpactClientControlRow[])
      : Promise.resolve([] as ImpactClientControlRow[]),
    requirementVersionIds.length
      ? ((await prisma.requirementApplicability.findMany({
          where: { requirementVersionId: { in: requirementVersionIds }, ...clientScopeWhere },
          select: {
            id: true,
            clientId: true,
            requirementVersionId: true,
            outcome: true,
            scopeType: true,
            evaluationAt: true,
          },
        })) as unknown as ImpactApplicabilityRow[])
      : Promise.resolve([] as ImpactApplicabilityRow[]),
  ]);

  const clients = await readClientNames(prisma, [
    ...documentReferences.map((reference) => reference.documentVersion.document.client.id),
    ...applicabilities.map((applicability) => applicability.clientId),
    ...clientControls.map((clientControl) => clientControl.clientId),
  ]);

  return assembleLegalSourceImpact({
    subjectType: 'LEGAL_SOURCE_VERSION',
    subject: {
      legalSourceVersionId: subjectRow.id,
      legalSourceId: subjectRow.legalSourceId,
      sourceKey: subjectRow.legalSource.sourceKey,
      canonicalCitation: subjectRow.legalSource.canonicalCitation ?? null,
      title: subjectRow.legalSource.title ?? null,
    },
    canonicalReference: null,
    documentReferences,
    citations,
    controlMaps,
    clientControls,
    applicabilities,
    clients,
    requirementDerivable: true,
    generatedAt,
  });
}

/**
 * Document-reference impact for a C4A canonical reference (`TV/...`).
 *
 * The match is an EXACT anchor-key equality on the normalized reference. A
 * canonical reference has no registry binding in schemaVersion 1, so the
 * requirement / control / applicability sections report `derivable: false`
 * instead of inventing a join through CELEX or through a title.
 *
 * `allowedClientIds` behaves exactly as in `buildLegalSourceImpactForVersion`.
 *
 * Returns null when the reference is not an exact canonical reference.
 */
export async function buildDocumentReferenceImpactForCanonicalReference(
  canonicalReference: string,
  prisma: PrismaClient = defaultPrisma,
  allowedClientIds: ReadonlySet<string> | null = null,
  generatedAt: string = new Date().toISOString(),
): Promise<LegalSourceImpactProjection | null> {
  const parsed = parseCanonicalLegalReference(canonicalReference);
  if (!parsed) return null;

  const scopedClientIds = allowedClientIds ? [...allowedClientIds] : null;

  const documentReferences = (await prisma.complianceDocumentClauseAnchor.findMany({
    where: {
      anchorKey: `${CANONICAL_REFERENCE_ANCHOR_KEY_PREFIX}${parsed.canonicalReference}`,
      ...(scopedClientIds
        ? { documentVersion: { document: { clientId: { in: scopedClientIds } } } }
        : {}),
    },
    select: DOCUMENT_REFERENCE_SELECT,
  })) as unknown as ImpactDocumentReferenceRow[];

  const clients = await readClientNames(
    prisma,
    documentReferences.map((reference) => reference.documentVersion.document.client.id),
  );

  return assembleLegalSourceImpact({
    subjectType: 'CANONICAL_REFERENCE',
    subject: null,
    canonicalReference: parsed.canonicalReference,
    documentReferences,
    citations: [],
    controlMaps: [],
    clientControls: [],
    applicabilities: [],
    clients,
    requirementDerivable: false,
    generatedAt,
  });
}
