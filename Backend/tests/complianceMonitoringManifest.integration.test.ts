/**
 * C4B — compliance monitoring manifest over PostgreSQL.
 *
 * Proves the CURRENT-demand selection and cross-client deduplication against a
 * real database: superseded DocumentVersions and CLIENT_POLICY documents create
 * no monitoring demand; identical legal sources referenced by different clients
 * collapse into one source without any client identity.
 *
 * Skipped without a test database, matching the repository convention.
 */
import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import { prisma as db } from '../src/prisma/prisma.service';
import { provisionComplianceModuleRules } from '../src/modules/compliance/complianceModuleProvisioning';
import { linkComplianceDocument } from '../src/modules/compliance/complianceDocumentService';
import { buildComplianceMonitoringManifest } from '../src/modules/compliance-doc-intelligence/monitoringManifest';

const dbUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = dbUrl ? describe : describe.skip;

describeWithDatabase('C4B compliance monitoring manifest (PostgreSQL)', () => {
  const suffix = `${Date.now()}`;
  const adminId = `c4b-${suffix}`;
  const clientAId = `c4b-a-${suffix}`;
  const clientBId = `c4b-b-${suffix}`;
  const caseAId = `c4b-case-a-${suffix}`;
  const caseBId = `c4b-case-b-${suffix}`;

  // Unique act numbers so the cross-client aggregate cannot collide with other suites.
  const actMain = `${900000 + (Number(suffix.slice(-5)) % 90000)}`;
  const actHistorical = `${Number(actMain) + 1}`;
  const actPolicy = `${Number(actMain) + 2}`;
  const MAIN_SOURCE = `TV/2026/${actMain}`;
  const SYNTHETIC_CELEX = '39999X9999';

  const documentIds: string[] = [];

  const createDocumentWithVersion = async (clientId: string, caseId: string, name: string) => {
    const document = await db.document.create({
      data: {
        clientId,
        caseId,
        name,
        title: name,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        category: 'EVIDENCE',
      } as never,
    });
    documentIds.push(document.id);
    const version = await db.documentVersion.create({
      data: { documentId: document.id, version: 1, name: `${name} v1`, uploadedById: adminId, isCurrent: true, spItemId: `sp-${document.id}` } as never,
    });
    return { documentId: document.id, versionId: version.id };
  };

  const addAnchor = async (documentVersionId: string, overrides: Record<string, unknown>) => {
    await db.complianceDocumentClauseAnchor.create({
      data: {
        documentVersionId,
        clauseRef: '1.1.',
        clauseTitle: null,
        clauseStableId: null,
        relationType: 'MANDATORY_BASIS',
        anchorType: 'LEGAL',
        anchorDisplay: 'anchor',
        anchorStableId: null,
        anchorKey: null,
        eli: null,
        celex: null,
        locator: null,
        ecli: null,
        caseId: null,
        caseLocator: null,
        decisionId: null,
        authorityLocator: null,
        sourceUrl: null,
        rationale: null,
        rowDigest: randomBytes(32).toString('hex'),
        ingestWarnings: [],
        ...overrides,
      } as never,
    });
  };

  beforeAll(async () => {
    await db.user.create({
      data: { id: adminId, email: `c4b-${suffix}@fixture.invalid`, name: 'C4B Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never,
    });
    for (const [clientId, caseId, label] of [
      [clientAId, caseAId, 'A'],
      [clientBId, caseBId, 'B'],
    ] as const) {
      await db.client.create({ data: { id: clientId, name: `C4B Client ${label}` } });
      await db.case.create({
        data: { id: caseId, caseNumber: `C4B-${label}-${suffix}`, title: `C4B Case ${label}`, caseType: 'OTHER', clientId, assignedLawyerId: adminId, createdById: adminId } as never,
      });
    }
    await provisionComplianceModuleRules(db, adminId);
  });

  afterAll(async () => {
    const versionIds = (await db.documentVersion.findMany({ where: { documentId: { in: documentIds } }, select: { id: true } })).map((row) => row.id);
    await db.complianceDocumentClauseAnchor.deleteMany({ where: { documentVersionId: { in: versionIds } } });
    await db.complianceDocument.deleteMany({ where: { documentId: { in: documentIds } } });
    await db.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } });
    await db.document.deleteMany({ where: { id: { in: documentIds } } });
    await db.case.deleteMany({ where: { id: { in: [caseAId, caseBId] } } });
    await db.client.deleteMany({ where: { id: { in: [clientAId, clientBId] } } });
    await db.user.deleteMany({ where: { id: adminId } });
  });

  it('H/I/K/L. includes only current INTERNAL_ANALYSIS demand and deduplicates across clients', async () => {
    const actor = { userId: adminId, role: 'ADMIN' };

    // Client A — current INTERNAL_ANALYSIS document.
    const a = await createDocumentWithVersion(clientAId, caseAId, 'C4B A internal');
    await linkComplianceDocument(actor, { clientId: clientAId, requirementKey: 'GDPR_GENERAL_SCOPE', documentId: a.documentId, audience: 'INTERNAL_ANALYSIS' });
    await addAnchor(a.versionId, { anchorKey: `LEGAL|REF=${MAIN_SOURCE}/1/1` });
    await addAnchor(a.versionId, { anchorKey: `LEGAL|REF=${MAIN_SOURCE}/2/2` });
    // Legacy NJT ELI — same TV source, different locator syntax (L).
    await addAnchor(a.versionId, { eli: `https://njt.jog.gov.hu/eli/${MAIN_SOURCE}`, locator: 'sec=9;par=1' });
    // Valid CELEX through the strict C3A normalizer.
    await addAnchor(a.versionId, { celex: SYNTHETIC_CELEX, locator: 'art=28;par=3' });
    // Unsupported ELI + invalid CELEX are accounted for, never invented.
    await addAnchor(a.versionId, { eli: 'https://example.com/eli/TV/2026/1' });
    await addAnchor(a.versionId, { celex: 'not-a-celex' });

    // H. Historical (non-current) version of the same document: excluded.
    await db.documentVersion.updateMany({ where: { documentId: a.documentId, isCurrent: true }, data: { isCurrent: false } });
    const historical = await db.documentVersion.create({
      data: { documentId: a.documentId, version: 2, name: 'C4B A historical', uploadedById: adminId, isCurrent: false, spItemId: `sp-${a.documentId}-2` } as never,
    });
    await addAnchor(historical.id, { anchorKey: `LEGAL|REF=TV/2026/${actHistorical}/9` });

    // I. CLIENT_POLICY-only document: excluded even though it is current.
    const policy = await createDocumentWithVersion(clientAId, caseAId, 'C4B A policy');
    await linkComplianceDocument(actor, { clientId: clientAId, requirementKey: 'GDPR_GENERAL_SCOPE', documentId: policy.documentId, audience: 'CLIENT_POLICY' });
    await addAnchor(policy.versionId, { anchorKey: `LEGAL|REF=TV/2026/${actPolicy}/5` });

    // K. Another client references the SAME source: one deduplicated source.
    const b = await createDocumentWithVersion(clientBId, caseBId, 'C4B B internal');
    await linkComplianceDocument(actor, { clientId: clientBId, requirementKey: 'GDPR_GENERAL_SCOPE', documentId: b.documentId, audience: 'INTERNAL_ANALYSIS' });
    await addAnchor(b.versionId, { anchorKey: `LEGAL|REF=${MAIN_SOURCE}/3/3` });

    const manifest = await buildComplianceMonitoringManifest(db);

    // Cross-client deduplication: A's and B's references collapse into one source.
    const main = manifest.sources.find(
      (source) => source.identifierFamily === 'TV' && source.sourceIdentifier === MAIN_SOURCE,
    );
    expect(main).toBeDefined();
    expect(main!.locators).toEqual(['1/1', '2/2', '3/3', 'sec=9;par=1']);
    expect(main!.referenceCount).toBe(4);

    // CELEX emitted through the existing strict normalizer.
    expect(
      manifest.sources.some(
        (source) => source.identifierFamily === 'CELEX' && source.sourceIdentifier === SYNTHETIC_CELEX,
      ),
    ).toBe(true);

    // H. Superseded version contributes nothing.
    expect(manifest.sources.some((source) => source.sourceIdentifier.includes(actHistorical))).toBe(false);
    // I. CLIENT_POLICY contributes nothing.
    expect(manifest.sources.some((source) => source.sourceIdentifier.includes(actPolicy))).toBe(false);

    // Unresolved references are accounted for (aggregate only).
    expect(manifest.unresolvedSummary.count).toBeGreaterThanOrEqual(2);
    expect(manifest.unresolvedSummary.reasons.UNSUPPORTED_ELI ?? 0).toBeGreaterThanOrEqual(1);
    expect(manifest.unresolvedSummary.reasons.INVALID_CELEX ?? 0).toBeGreaterThanOrEqual(1);

    // J. No customer/document identity anywhere in the serialized DTO.
    const serialized = JSON.stringify(manifest);
    for (const token of [clientAId, clientBId, caseAId, caseBId, a.documentId, b.documentId, policy.documentId, 'fixture.invalid', 'C4B Client']) {
      expect(serialized).not.toContain(token);
    }
  });
});
