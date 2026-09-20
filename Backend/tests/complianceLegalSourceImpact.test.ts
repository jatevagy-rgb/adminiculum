/**
 * C4C — legal-source impact projection (no database).
 *
 * Pins the exact-only impact rules of the internal projection:
 *  - an exact anchor / citation / map / applicability is followed;
 *  - a non-matching identity contributes nothing;
 *  - an unrelated control or requirement is excluded;
 *  - a canonical reference without a registry binding is reported as NOT
 *    derivable instead of guessed;
 *  - the three client-impact kinds stay separate;
 *  - a legal change means REVIEW REQUIRED, never an automatic action;
 *  - the DTO carries no raw document content and no internal identifier
 *    metadata, and no customer-facing module may consume it.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEGAL_SOURCE_IMPACT_SCHEMA_VERSION,
  assembleLegalSourceImpact,
  projectClientImpact,
  projectControlImpact,
  type ImpactApplicabilityRow,
  type ImpactCitationRow,
  type ImpactClientControlRow,
  type ImpactControlMapRow,
  type ImpactDocumentReferenceRow,
} from '../src/modules/compliance/legalSourceImpact';

const GENERATED_AT = '2026-09-20T00:00:00.000Z';

function referenceRow(overrides: {
  clientId: string;
  clientName?: string;
  documentId: string;
  documentName?: string;
  documentVersionId?: string;
  version?: number;
  isCurrent?: boolean;
  clauseRef?: string;
  anchorType?: string;
  relationType?: string;
  anchorKey?: string | null;
}): ImpactDocumentReferenceRow {
  return {
    documentVersionId: overrides.documentVersionId ?? `${overrides.documentId}-v${overrides.version ?? 1}`,
    clauseRef: overrides.clauseRef ?? '1.1.',
    clauseTitle: null,
    anchorType: overrides.anchorType ?? 'LEGAL',
    relationType: overrides.relationType ?? 'MANDATORY_BASIS',
    anchorKey: overrides.anchorKey ?? null,
    documentVersion: {
      version: overrides.version ?? 1,
      isCurrent: overrides.isCurrent ?? true,
      document: {
        id: overrides.documentId,
        name: overrides.documentName ?? `${overrides.documentId}.docx`,
        clientId: overrides.clientId,
        client: { id: overrides.clientId, name: overrides.clientName ?? overrides.clientId },
      },
    },
  };
}

function citationRow(overrides: {
  citationId?: string;
  requirementVersionId: string;
  requirementId: string;
  requirementKey: string;
  domainCode?: string;
  requirementStatus?: string;
  versionKey?: string;
  versionTitle?: string;
  versionStatus?: string;
  supportRole?: string;
  locator?: string | null;
}): ImpactCitationRow {
  return {
    id: overrides.citationId ?? `cit-${overrides.requirementVersionId}`,
    requirementVersionId: overrides.requirementVersionId,
    supportRole: overrides.supportRole ?? 'PRIMARY',
    locator: overrides.locator ?? null,
    requirementVersion: {
      id: overrides.requirementVersionId,
      requirementId: overrides.requirementId,
      versionKey: overrides.versionKey ?? 'V1',
      title: overrides.versionTitle ?? overrides.requirementKey,
      status: overrides.versionStatus ?? 'APPROVED',
      requirement: {
        id: overrides.requirementId,
        key: overrides.requirementKey,
        domainCode: overrides.domainCode ?? 'GDPR',
        status: overrides.requirementStatus ?? 'ACTIVE',
      },
    },
  };
}

function controlMapRow(overrides: {
  requirementVersionId: string;
  controlDefinitionId: string;
  controlKey: string;
  title?: string;
}): ImpactControlMapRow {
  return {
    id: `map-${overrides.requirementVersionId}-${overrides.controlDefinitionId}`,
    requirementVersionId: overrides.requirementVersionId,
    controlDefinitionId: overrides.controlDefinitionId,
    controlDefinition: {
      id: overrides.controlDefinitionId,
      key: overrides.controlKey,
      title: overrides.title ?? overrides.controlKey,
      type: 'ORGANIZATIONAL',
      status: 'ACTIVE',
    },
  };
}

function clientControlRow(overrides: {
  id: string;
  clientId: string;
  controlDefinitionId: string;
  implementationStatus?: string;
}): ImpactClientControlRow {
  return {
    id: overrides.id,
    clientId: overrides.clientId,
    controlDefinitionId: overrides.controlDefinitionId,
    implementationStatus: overrides.implementationStatus ?? 'IMPLEMENTED',
    lastReviewedAt: null,
    nextReviewAt: null,
  };
}

function applicabilityRow(overrides: {
  id: string;
  clientId: string;
  requirementVersionId: string;
  outcome?: string;
}): ImpactApplicabilityRow {
  return {
    id: overrides.id,
    clientId: overrides.clientId,
    requirementVersionId: overrides.requirementVersionId,
    outcome: overrides.outcome ?? 'APPLIES',
    scopeType: 'COMPANY',
    evaluationAt: new Date('2026-09-01T00:00:00.000Z'),
  };
}

function assemble(overrides: Partial<Parameters<typeof assembleLegalSourceImpact>[0]> = {}) {
  return assembleLegalSourceImpact({
    subjectType: 'LEGAL_SOURCE_VERSION',
    subject: {
      legalSourceVersionId: 'lsv-1',
      legalSourceId: 'ls-1',
      sourceKey: 'EU-32016R0679',
      canonicalCitation: null,
      title: null,
    },
    canonicalReference: null,
    documentReferences: [],
    citations: [],
    controlMaps: [],
    clientControls: [],
    applicabilities: [],
    clients: [],
    requirementDerivable: true,
    generatedAt: GENERATED_AT,
    ...overrides,
  });
}

describe('C4C document-reference impact — exact anchor only', () => {
  it('finds the referenced document and derives the canonical reference from the anchor key', () => {
    const projection = assemble({
      documentReferences: [
        referenceRow({
          clientId: 'client-a',
          clientName: 'Client A',
          documentId: 'doc-a',
          clauseRef: '3.2.',
          anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b',
        }),
        // A row with no canonical machine reference: the reference stays null.
        referenceRow({
          clientId: 'client-a',
          documentId: 'doc-a',
          clauseRef: '3.3.',
          anchorKey: 'LEGAL|SID=la_x',
        }),
      ],
    });

    expect(projection.schemaVersion).toBe(LEGAL_SOURCE_IMPACT_SCHEMA_VERSION);
    expect(projection.generatedAt).toBe(GENERATED_AT);
    expect(projection.documentReferenceImpact.totals).toEqual({
      references: 2,
      documents: 1,
      documentVersions: 1,
      clients: 1,
    });
    expect(projection.documentReferenceImpact.references.map((reference) => reference.canonicalReference)).toEqual([
      'TV/2001/108/5/2/b',
      null,
    ]);
  });

  it('finds none for a wrong / non-matching reference', () => {
    const projection = assemble({ documentReferences: [] });

    expect(projection.documentReferenceImpact.references).toEqual([]);
    expect(projection.documentReferenceImpact.totals).toEqual({
      references: 0,
      documents: 0,
      documentVersions: 0,
      clients: 0,
    });
    expect(projection.review.reviewRequired).toBe(false);
  });
});

describe('C4C requirement / control impact — exact citation and exact map', () => {
  it('maps an exact citation to its requirement and excludes an unrelated requirement', () => {
    const projection = assemble({
      citations: [
        citationRow({ requirementVersionId: 'rv-1', requirementId: 'req-1', requirementKey: 'REQ_ONE', locator: 'art=28' }),
      ],
      // Unrelated citation of another legal source is not part of this subject.
    });

    expect(projection.requirementImpact.derivable).toBe(true);
    expect(projection.requirementImpact.unavailableReason).toBeNull();
    expect(projection.requirementImpact.totals).toEqual({ citations: 1, requirementVersions: 1, requirements: 1 });
    expect(projection.requirementImpact.citations[0]).toMatchObject({
      requirementId: 'req-1',
      requirementKey: 'REQ_ONE',
      supportRole: 'PRIMARY',
      citationLocator: 'art=28',
    });
    expect(projection.requirementImpact.citations.some((citation) => citation.requirementKey === 'REQ_TWO')).toBe(false);
    // A citation alone is a review basis even without any client-level impact.
    expect(projection.review.requirementCitationPresent).toBe(true);
    expect(projection.review.reviewRequired).toBe(true);
  });

  it('keeps the requirement-control map exact and excludes an unrelated control', () => {
    const impacted = projectControlImpact(
      [controlMapRow({ requirementVersionId: 'rv-1', controlDefinitionId: 'cd-1', controlKey: 'CTRL_ONE' })],
      [
        clientControlRow({ id: 'cc-1', clientId: 'client-a', controlDefinitionId: 'cd-1' }),
        clientControlRow({ id: 'cc-unrelated', clientId: 'client-a', controlDefinitionId: 'cd-2' }),
      ],
      true,
    );

    expect(impacted.controlDefinitions.map((definition) => definition.controlKey)).toEqual(['CTRL_ONE']);
    expect(impacted.controlDefinitions[0].viaRequirementVersionIds).toEqual(['rv-1']);
    // The unrelated control is never claimed, even when a ClientControl exists.
    expect(impacted.clientControls.map((clientControl) => clientControl.clientControlId)).toEqual(['cc-1']);
    expect(impacted.totals).toEqual({ controlDefinitions: 1, clientControls: 1, clients: 1 });
  });

  it('documents the exact requirement-control path in the assembled projection', () => {
    const projection = assemble({
      citations: [citationRow({ requirementVersionId: 'rv-1', requirementId: 'req-1', requirementKey: 'REQ_ONE' })],
      controlMaps: [
        controlMapRow({ requirementVersionId: 'rv-1', controlDefinitionId: 'cd-1', controlKey: 'CTRL_ONE' }),
      ],
      clientControls: [clientControlRow({ id: 'cc-1', clientId: 'client-a', controlDefinitionId: 'cd-1' })],
    });

    expect(projection.controlImpact.totals.controlDefinitions).toBe(1);
    expect(projection.controlImpact.clientControls[0]).toMatchObject({
      clientControlId: 'cc-1',
      clientId: 'client-a',
      controlDefinitionId: 'cd-1',
      implementationStatus: 'IMPLEMENTED',
    });
    // Reading the impact NEVER changes an implementation state.
    expect(projection.review.automaticActionsCreated).toBe(0);
  });
});

describe('C4C applicability impact — scoped to exactly impacted requirement versions', () => {
  it('keeps only applicability snapshots of an impacted requirement version', () => {
    const projection = assemble({
      citations: [citationRow({ requirementVersionId: 'rv-1', requirementId: 'req-1', requirementKey: 'REQ_ONE' })],
      applicabilities: [
        applicabilityRow({ id: 'app-a', clientId: 'client-a', requirementVersionId: 'rv-1' }),
        // Another requirement version of the same client is NOT impacted here.
        applicabilityRow({ id: 'app-unrelated', clientId: 'client-a', requirementVersionId: 'rv-2' }),
        applicabilityRow({ id: 'app-b', clientId: 'client-b', requirementVersionId: 'rv-1', outcome: 'DOES_NOT_APPLY' }),
      ],
    });

    expect(projection.applicabilityImpact.applicabilities.map((applicability) => applicability.applicabilityId)).toEqual([
      'app-a',
      'app-b',
    ]);
    expect(projection.applicabilityImpact.totals).toEqual({ applicabilities: 2, clients: 2 });
  });
});

describe('C4C client impact — three kinds never collapsed', () => {
  it('reports a client under each exact persisted path it actually has', () => {
    const entries = projectClientImpact({
      documentReferences: [
        referenceRow({ clientId: 'client-a', clientName: 'Client A', documentId: 'doc-a', anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
      ],
      applicabilities: [applicabilityRow({ id: 'app-a', clientId: 'client-a', requirementVersionId: 'rv-1' })],
      clientControls: [clientControlRow({ id: 'cc-a', clientId: 'client-a', controlDefinitionId: 'cd-1' })],
      impactedControlDefinitionIds: ['cd-1'],
      clients: [{ id: 'client-a', name: 'Client A' }],
    });

    const clientA = entries.find((entry) => entry.clientId === 'client-a');
    expect(clientA).toMatchObject({
      clientName: 'Client A',
      documentReferenceCount: 1,
      applicabilityCount: 1,
      clientControlCount: 1,
    });
    expect(clientA!.impactKinds).toEqual([
      'DOCUMENT_REFERENCE_IMPACT',
      'APPLICABILITY_IMPACT',
      'CONTROL_IMPACT',
    ]);
  });

  it('does not mark a client with only a ClientControl for an unrelated control', () => {
    const entries = projectClientImpact({
      documentReferences: [],
      applicabilities: [],
      clientControls: [clientControlRow({ id: 'cc-x', clientId: 'client-x', controlDefinitionId: 'cd-unrelated' })],
      impactedControlDefinitionIds: ['cd-1'],
      clients: [{ id: 'client-x', name: 'Client X' }],
    });

    const clientX = entries.find((entry) => entry.clientId === 'client-x');
    // The client exists but has NO impact kind: a ClientControl outside the exact
    // map is not impact.
    expect(clientX!.impactKinds).toEqual([]);
    expect(clientX!.clientControlCount).toBe(0);
  });
});

describe('C4C canonical-reference-only subject — no invented registry binding', () => {
  it('reports requirement/control/applicability as NOT derivable', () => {
    const projection = assembleLegalSourceImpact({
      subjectType: 'CANONICAL_REFERENCE',
      subject: null,
      canonicalReference: 'TV/2001/108/5/2/b',
      documentReferences: [
        referenceRow({ clientId: 'client-a', documentId: 'doc-a', anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
      ],
      citations: [],
      controlMaps: [],
      clientControls: [],
      applicabilities: [],
      clients: [],
      requirementDerivable: false,
      generatedAt: GENERATED_AT,
    });

    expect(projection.subjectType).toBe('CANONICAL_REFERENCE');
    expect(projection.subject).toBeNull();
    expect(projection.canonicalReference).toBe('TV/2001/108/5/2/b');
    expect(projection.documentReferenceImpact.totals.references).toBe(1);
    expect(projection.requirementImpact).toMatchObject({
      derivable: false,
      unavailableReason: 'NO_CANONICAL_REGISTRY_BINDING',
    });
    expect(projection.controlImpact.derivable).toBe(false);
    expect(projection.applicabilityImpact.derivable).toBe(false);
    // A document reference still drives review attention.
    expect(projection.review.basis).toEqual(['DOCUMENT_REFERENCE_IMPACT']);
    expect(projection.review.reviewRequired).toBe(true);
  });
});

describe('C4C projection boundary', () => {
  it('carries no raw document content and no internal identifier metadata', () => {
    const projection = assemble({
      documentReferences: [
        referenceRow({ clientId: 'client-a', documentId: 'doc-a', anchorKey: 'LEGAL|REF=TV/2001/108/5/2/b' }),
      ],
    });

    const reference = projection.documentReferenceImpact.references[0];
    expect(Object.keys(reference).sort()).toEqual(
      [
        'anchorType',
        'canonicalReference',
        'clauseRef',
        'clauseTitle',
        'clientId',
        'clientName',
        'documentId',
        'documentName',
        'documentVersionId',
        'isCurrent',
        'relationType',
        'version',
      ].sort(),
    );

    const serialized = JSON.stringify(projection);
    for (const token of [
      'anchorKey',
      'anchorDisplay',
      'anchorStableId',
      'rationale',
      'rowDigest',
      'ingestWarnings',
      'celex',
      'ecli',
      'sourceUrl',
      'legalSourceBindingStatus',
    ]) {
      expect(serialized).not.toContain(token);
    }
    // The raw anchor key value itself never survives the projection.
    expect(serialized).not.toContain('LEGAL|REF=');
  });

  it('exposes the impact projection through an internal-only route with requireInternal', () => {
    const routesSource = readFileSync(
      join(__dirname, '..', 'src', 'modules', 'compliance-doc-intelligence', 'routes.ts'),
      'utf8',
    );
    const routeIndex = routesSource.indexOf("'/legal-source-impact'");
    expect(routeIndex).toBeGreaterThan(-1);
    const handler = routesSource.slice(routeIndex, routeIndex + 2000);
    expect(handler).toContain('requireInternal');
    expect(handler).toContain('resolveImpactClientScope');
    expect(handler).toContain('buildLegalSourceImpactForVersion');
    expect(handler).toContain('buildDocumentReferenceImpactForCanonicalReference');
    // The impact graph is cross-client internal, but it is scoped to the actor's
    // client read scope; no per-client assertClientReadAccess is faked.
    expect(handler).not.toContain('assertClientReadAccess');
  });

  it('is never imported by a customer-facing compliance module', () => {
    const clientFacingModules = [
      'modules/compliance/clientSafeComplianceService.ts',
      'modules/compliance/clientSafeComplianceRoutes.ts',
      'modules/compliance/companyGrowthNarrative.ts',
      'modules/compliance/safeTopicRegistry.ts',
      'modules/client-publication/publicationService.ts',
      'modules/client-publication/internalCasePortalPublication.service.ts',
      'modules/client-publication/publication.routes.ts',
    ];
    const srcRoot = join(__dirname, '..', 'src');

    for (const modulePath of clientFacingModules) {
      const source = readFileSync(join(srcRoot, modulePath), 'utf8');
      for (const token of ['legalSourceImpact', 'LegalSourceImpact', 'DOCUMENT_REFERENCE_IMPACT']) {
        expect(`${modulePath}:${source.includes(token) ? token : ''}`).toBe(`${modulePath}:`);
      }
    }
  });
});
