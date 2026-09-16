/**
 * C3A — exact CELEX-only canonical binding against PostgreSQL.
 *
 * Proves the immutability split required by the C3 audit:
 *  - a historical anchor row is NEVER updated by binding resolution (read-time only)
 *  - a genuinely new DocumentVersion may be bound at row creation, and only then
 *  - idempotency, drift rules and the client boundary are unchanged
 *  - this flow writes no Requirement / RequirementCitation / applicability row
 *
 * Canonical fixtures are created by this test itself (never by application code)
 * so the suite is deterministic even when other suites in the same database have
 * already provisioned the shared GDPR/NIS2 sources.
 */
import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { prisma as db } from '../src/prisma/prisma.service';
import { linkComplianceDocument } from '../src/modules/compliance/complianceDocumentService';
import {
  ingestClauseAnchorsForVersion,
  ingestCurrentVersionForInternalAnalysisDocument,
  listClauseAnchorsForDocumentWithBinding,
} from '../src/modules/compliance-doc-intelligence/service';
import {
  caseRowXml,
  cellWithControls,
  docxRow,
  masterDocxBuffer,
  relationRowXml,
  sdt,
} from './helpers/complianceMasterDocxFixture';

const dbUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = dbUrl ? describe : describe.skip;

const BINDABLE_CELEX = '32019R1234';
const AMBIGUOUS_CELEX = '32019R1235';
const UNAPPROVED_CELEX = '32019R1236';
const MALFORMED_CELEX = '99999X9999';

/** A legal anchor row with the metadata shape this test needs. */
function legalRow(options: {
  clause: string;
  anchorId: string;
  celex?: string | null;
  eli?: string | null;
  relation?: string;
}): string {
  const metadata = [
    ...(options.celex ? [{ kind: 'ADM-CELEX', id: options.anchorId, alias: `CELEX | ${options.celex}`, value: options.celex }] : []),
    ...(options.eli ? [{ kind: 'ADM-ELI', id: options.anchorId, alias: `ELI | ${options.eli}`, value: options.eli }] : []),
  ];
  return relationRowXml({
    clauseId: `cl_${options.clause.replace(/\W/g, '')}`,
    clause: options.clause,
    relationId: `rel_${options.clause.replace(/\W/g, '')}`,
    relation: options.relation ?? 'MANDATORY_BASIS',
    anchor: { kind: 'ADM-LEGALANCHOR', id: options.anchorId, display: `Jogszabály ${options.clause}` },
    metadata,
    rationale: 'C3A teszt sor.',
  });
}

describeWithDatabase('C3A exact CELEX binding (vertical slice)', () => {
  const suffix = `${Date.now()}`;
  const adminId = `c3a-${suffix}`;
  const clientId = `c3a-client-${suffix}`;
  const caseId = `c3a-case-${suffix}`;

  const bindableSourceId = `c3a-source-bindable-${suffix}`;
  const ambiguousSourceId = `c3a-source-ambiguous-${suffix}`;
  const unapprovedSourceId = `c3a-source-unapproved-${suffix}`;
  const bindableVersionId = `c3a-version-bindable-${suffix}`;

  const historicalDocumentId = `c3a-doc-history-${suffix}`;
  const historicalVersionId = `c3a-doc-history-v1-${suffix}`;
  const newVersionDocumentId = `c3a-doc-new-${suffix}`;
  const newVersionId = `c3a-doc-new-v1-${suffix}`;
  const policyDocumentId = `c3a-doc-policy-${suffix}`;
  const policyVersionId = `c3a-doc-policy-v1-${suffix}`;

  const actor = () => ({ userId: adminId, role: 'ADMIN' });

  const createDocumentWithVersion = async (documentId: string, versionId: string, name: string) => {
    await db.document.create({
      data: {
        id: documentId,
        clientId,
        caseId,
        name,
        title: name,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        category: 'EVIDENCE',
      } as never,
    });
    await db.documentVersion.create({
      data: { id: versionId, documentId, version: 1, name: `${name} v1`, uploadedById: adminId, isCurrent: true, spItemId: `sp-${documentId}` } as never,
    });
  };

  const rowsForVersion = (documentVersionId: string) =>
    db.complianceDocumentClauseAnchor.findMany({
      where: { documentVersionId },
      orderBy: [{ clauseRef: 'asc' }, { id: 'asc' }],
    });

  const rowsOf = (documentId: string) => listClauseAnchorsForDocumentWithBinding(documentId);
  const rowByClause = async (documentId: string, clauseRef: string) => {
    const projection = await rowsOf(documentId);
    return projection.versions.flatMap((version) => version.rows).find((row) => row.clauseRef === clauseRef);
  };

  /** One historical-version buffer with every binding outcome this slice defines. */
  const mixedBuffer = () =>
    masterDocxBuffer(
      legalRow({ clause: '3.1.', anchorId: 'la_bindable', celex: BINDABLE_CELEX }) +
        legalRow({ clause: '3.2.', anchorId: 'la_ambiguous', celex: AMBIGUOUS_CELEX }) +
        legalRow({ clause: '3.3.', anchorId: 'la_unapproved', celex: UNAPPROVED_CELEX }) +
        legalRow({ clause: '3.4.', anchorId: 'la_malformed', celex: MALFORMED_CELEX }) +
        legalRow({ clause: '3.5.', anchorId: 'la_eli_only', eli: 'http://data.europa.eu/eli/reg/2016/679/oj' }) +
        // CASE anchor row (helper fixture clause 1.2.) — never CELEX-bindable.
        caseRowXml(),
    );

  const canonicalFixtures = [
    { id: bindableSourceId, sourceKey: `EU-${BINDABLE_CELEX}` },
    { id: ambiguousSourceId, sourceKey: `EU-${AMBIGUOUS_CELEX}` },
    { id: unapprovedSourceId, sourceKey: `EU-${UNAPPROVED_CELEX}` },
  ];

  beforeAll(async () => {
    await db.user.create({
      data: { id: adminId, email: `c3a-${suffix}@fixture.invalid`, name: 'C3A Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never,
    });
    await db.client.create({ data: { id: clientId, name: 'C3A Client' } });
    await db.case.create({
      data: { id: caseId, caseNumber: `C3A-${suffix}`, title: 'C3A Case', caseType: 'OTHER', clientId, assignedLawyerId: adminId, createdById: adminId } as never,
    });
    await createDocumentWithVersion(historicalDocumentId, historicalVersionId, 'Történeti compliance master');
    await createDocumentWithVersion(newVersionDocumentId, newVersionId, 'Új compliance master');
    await createDocumentWithVersion(policyDocumentId, policyVersionId, 'Ügyfél szabályzat');

    // 1) Ingest FIRST, before any canonical row exists for these CELEX values, so
    //    the historical version's rows are created unbound.
    const historical = await ingestClauseAnchorsForVersion(
      { id: historicalVersionId, documentId: historicalDocumentId, spItemId: null },
      await mixedBuffer(),
    );
    expect(historical.status).toBe('CREATED');
    expect(historical.insertedRows).toBe(6);

    // 2) Canonical fixtures (test-owned): one bindable, one ambiguous, one unapproved.
    for (const fixture of canonicalFixtures) {
      await db.legalSource.create({
        data: { id: fixture.id, sourceKey: fixture.sourceKey, jurisdictionCode: 'EU', instrumentType: 'REGULATION', status: 'CANDIDATE' } as never,
      });
    }
    await db.legalSourceVersion.create({
      data: { id: bindableVersionId, legalSourceId: bindableSourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' } as never,
    });
    await db.legalSourceVersion.createMany({
      data: [
        { legalSourceId: ambiguousSourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'APPROVED' },
        { legalSourceId: ambiguousSourceId, legalVersionKey: 'V2', status: 'ACTIVE', reviewStatus: 'APPROVED' },
        { legalSourceId: unapprovedSourceId, legalVersionKey: 'V1', status: 'ACTIVE', reviewStatus: 'UNREVIEWED' },
      ] as never,
    });
  });

  afterAll(async () => {
    const versionIds = [historicalVersionId, newVersionId, policyVersionId];
    await db.complianceDocumentClauseAnchor.deleteMany({ where: { documentVersionId: { in: versionIds } } });
    await db.complianceDocument.deleteMany({ where: { document: { clientId } } });
    await db.documentVersion.deleteMany({ where: { documentId: { in: [historicalDocumentId, newVersionDocumentId, policyDocumentId] } } });
    await db.document.deleteMany({ where: { id: { in: [historicalDocumentId, newVersionDocumentId, policyDocumentId] } } });
    await db.legalSourceVersion.deleteMany({ where: { legalSourceId: { in: canonicalFixtures.map((fixture) => fixture.id) } } });
    await db.legalSource.deleteMany({ where: { id: { in: canonicalFixtures.map((fixture) => fixture.id) } } });
    await db.case.deleteMany({ where: { id: caseId } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.user.deleteMany({ where: { id: adminId } });
  });

  it('binds an exact CELEX match, and only that, when reading a historical version', async () => {
    const bindable = await rowByClause(historicalDocumentId, '3.1.');
    expect(bindable).toBeDefined();
    expect(bindable!.legalSourceBindingStatus).toBe('RESOLVED');
    expect(bindable!.canonicalLegalSourceVersionId).toBe(bindableVersionId);
    expect(bindable!.bindingOrigin).toBe('READ_TIME_EXACT_CELEX');
    expect(bindable!.bindingReason).toBe(`EXACT_CELEX_MATCH:${BINDABLE_CELEX}`);
    // The seeded canonical labels are genuinely null: no label is invented.
    expect(bindable!.canonicalCitation).toBeNull();
    expect(bindable!.canonicalTitle).toBeNull();

    const ambiguous = await rowByClause(historicalDocumentId, '3.2.');
    expect(ambiguous).toMatchObject({ legalSourceBindingStatus: 'UNRESOLVED', bindingReason: 'AMBIGUOUS_BINDABLE_VERSION' });

    const unapproved = await rowByClause(historicalDocumentId, '3.3.');
    expect(unapproved).toMatchObject({ legalSourceBindingStatus: 'UNRESOLVED', bindingReason: 'NO_BINDABLE_VERSION' });

    const malformed = await rowByClause(historicalDocumentId, '3.4.');
    expect(malformed).toMatchObject({ legalSourceBindingStatus: 'UNRESOLVED', bindingReason: 'INVALID_CELEX' });

    const eliOnly = await rowByClause(historicalDocumentId, '3.5.');
    expect(eliOnly).toMatchObject({ legalSourceBindingStatus: 'UNRESOLVED', bindingReason: 'NO_CELEX' });

    const caseAnchor = await rowByClause(historicalDocumentId, '1.2.');
    expect(caseAnchor).toBeDefined();
    expect(caseAnchor!.anchorType).toBe('CASE');
    expect(caseAnchor).toMatchObject({ legalSourceBindingStatus: 'UNRESOLVED', bindingReason: 'NO_CELEX' });
  });

  it('leaves historical anchor rows byte-faithful after read-time resolution', async () => {
    const before = await rowsForVersion(historicalVersionId);
    expect(before.every((row) => row.legalSourceVersionId === null)).toBe(true);
    const snapshot = before.map((row) => ({ id: row.id, legalSourceVersionId: row.legalSourceVersionId, rowDigest: row.rowDigest, ingestedAt: row.ingestedAt.toISOString() }));

    // Resolve twice through the internal projection.
    await rowsOf(historicalDocumentId);
    await rowsOf(historicalDocumentId);

    const after = await rowsForVersion(historicalVersionId);
    expect(after.map((row) => ({ id: row.id, legalSourceVersionId: row.legalSourceVersionId, rowDigest: row.rowDigest, ingestedAt: row.ingestedAt.toISOString() }))).toEqual(snapshot);
    expect(after.every((row) => row.legalSourceVersionId === null)).toBe(true);
    expect(after).toHaveLength(6);
  });

  it('persists the exact binding at row creation for a genuinely new version', async () => {
    const result = await ingestClauseAnchorsForVersion(
      { id: newVersionId, documentId: newVersionDocumentId, spItemId: null },
      await masterDocxBuffer(legalRow({ clause: '2.1.', anchorId: 'la_new', celex: BINDABLE_CELEX })),
    );
    expect(result.status).toBe('CREATED');

    const stored = await rowsForVersion(newVersionId);
    expect(stored).toHaveLength(1);
    expect(stored[0].legalSourceVersionId).toBe(bindableVersionId);

    const projected = await rowByClause(newVersionDocumentId, '2.1.');
    expect(projected).toMatchObject({
      legalSourceBindingStatus: 'RESOLVED',
      canonicalLegalSourceVersionId: bindableVersionId,
      bindingOrigin: 'PERSISTED_AT_INGEST',
      bindingReason: 'PERSISTED_BINDING',
    });
  });

  it('stays a no-op on repeated ingest and never rewrites a stored binding', async () => {
    const before = await rowsForVersion(newVersionId);
    const buffer = await masterDocxBuffer(legalRow({ clause: '2.1.', anchorId: 'la_new', celex: BINDABLE_CELEX }));

    const repeated = await ingestClauseAnchorsForVersion({ id: newVersionId, documentId: newVersionDocumentId, spItemId: null }, buffer);
    expect(repeated.status).toBe('UNCHANGED');
    expect(repeated.insertedRows).toBe(0);

    const after = await rowsForVersion(newVersionId);
    expect(after.map((row) => ({ id: row.id, legalSourceVersionId: row.legalSourceVersionId, rowDigest: row.rowDigest, ingestedAt: row.ingestedAt.toISOString() }))).toEqual(
      before.map((row) => ({ id: row.id, legalSourceVersionId: row.legalSourceVersionId, rowDigest: row.rowDigest, ingestedAt: row.ingestedAt.toISOString() })),
    );
  });

  it('keeps the same-version drift rules unchanged', async () => {
    const before = await rowsForVersion(newVersionId);
    const drifted = await masterDocxBuffer(legalRow({ clause: '2.1.', anchorId: 'la_new', celex: BINDABLE_CELEX, relation: 'LEGAL_LIMIT' }));

    const result = await ingestClauseAnchorsForVersion({ id: newVersionId, documentId: newVersionDocumentId, spItemId: null }, drifted);
    expect(result.status).toBe('INGEST_DRIFT');
    expect(result.insertedRows).toBe(0);

    const after = await rowsForVersion(newVersionId);
    expect(after).toHaveLength(before.length);
    expect(after[0].legalSourceVersionId).toBe(bindableVersionId);
    expect(after[0].relationType).toBe('MANDATORY_BASIS');
  });

  it('never triggers ingestion for a CLIENT_POLICY-only document', async () => {
    await linkComplianceDocument(actor(), {
      clientId,
      requirementKey: 'GDPR_GENERAL_SCOPE',
      documentId: policyDocumentId,
      audience: 'CLIENT_POLICY',
    });

    const result = await ingestCurrentVersionForInternalAnalysisDocument(policyDocumentId);
    expect(result.status).toBe('SKIPPED_NOT_INTERNAL_ANALYSIS');
    expect(await rowsForVersion(policyVersionId)).toHaveLength(0);

    const projection = await rowsOf(policyDocumentId);
    expect(projection.versions.flatMap((version) => version.rows)).toHaveLength(0);
  });

  it('writes no Requirement, citation or applicability row in this flow', async () => {
    const countAll = async () => ({
      requirement: await db.requirement.count(),
      requirementVersion: await db.requirementVersion.count(),
      requirementCitation: await db.requirementCitation.count(),
      requirementApplicability: await db.requirementApplicability.count(),
      requirementControlMap: await db.requirementControlMap.count(),
      applicabilityRuleVersion: await db.applicabilityRuleVersion.count(),
      legalSource: await db.legalSource.count(),
      legalSourceVersion: await db.legalSourceVersion.count(),
      legalSourceCapture: await db.legalSourceCapture.count(),
    });

    const before = await countAll();

    // A full binding cycle: read-time resolution plus a new-version ingest.
    await rowsOf(historicalDocumentId);
    await ingestClauseAnchorsForVersion(
      { id: newVersionId, documentId: newVersionDocumentId, spItemId: null },
      await masterDocxBuffer(legalRow({ clause: '2.1.', anchorId: 'la_new', celex: BINDABLE_CELEX })),
    );

    expect(await countAll()).toEqual(before);
  });
});
