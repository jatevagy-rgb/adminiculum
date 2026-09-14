import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { prisma as db } from '../src/prisma/prisma.service';
import { provisionComplianceModuleRules } from '../src/modules/compliance/complianceModuleProvisioning';
import { linkComplianceDocument, listComplianceDocuments, unlinkComplianceDocument } from '../src/modules/compliance/complianceDocumentService';
import { getClientSafeComplianceReadModel } from '../src/modules/compliance/clientSafeComplianceService';

const dbUrl = process.env.CLIENT_INTERACTION_TEST_DATABASE_URL || process.env.MIGRATION_REPLAY_DATABASE_URL;
const describeWithDatabase = dbUrl ? describe : describe.skip;

describeWithDatabase('Compliance document dual-audience linkage (vertical slice)', () => {
  let adminId = '';
  let clientId = '';
  let caseId = '';
  let documentId = '';
  let documentVersionId = '';
  let internalDocumentId = '';

  beforeAll(async () => {
    const suffix = Date.now();
    await provisionComplianceModuleRules(db, 'system:compliance-doc-test');

    adminId = `compdoc-${suffix}`;
    clientId = `compdoc-client-${suffix}`;
    caseId = `compdoc-case-${suffix}`;
    await db.user.create({ data: { id: adminId, email: `compdoc-${suffix}@fixture.invalid`, name: 'Compliance Doc Admin', role: 'ADMIN', status: 'ACTIVE', isActive: true, skills: [] } as never });
    await db.client.create({ data: { id: clientId, name: 'Compliance Doc Client' } });
    await db.case.create({ data: { id: caseId, caseNumber: `CD-${suffix}`, title: 'Compliance Doc Case', caseType: 'OTHER', clientId, assignedLawyerId: adminId, createdById: adminId } as never });

    const createDoc = async (name: string, title: string) => {
      const doc = await db.document.create({ data: { clientId, caseId, name, title, mimeType: 'application/pdf', category: 'EVIDENCE' } as never });
      await db.documentVersion.create({ data: { documentId: doc.id, version: 1, name: `${name} v1`, uploadedById: adminId } as never });
      return doc.id;
    };

    documentId = await createDoc('Adatkezelési szabályzat', 'Adatkezelési szabályzat');
    internalDocumentId = await createDoc('GDPR belső elemzés', 'GDPR belső elemzés');
  });

  afterAll(async () => {
    await db.clientDocumentPublication.deleteMany({ where: { clientId } });
    await db.complianceDocument.deleteMany({ where: { document: { clientId } } });
    await db.documentVersion.deleteMany({ where: { documentId: { in: [documentId, internalDocumentId].filter(Boolean) } } });
    await db.document.deleteMany({ where: { id: { in: [documentId, internalDocumentId].filter(Boolean) } } });
    await db.case.deleteMany({ where: { id: caseId } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.user.deleteMany({ where: { id: adminId } });
  });

  it('links INTERNAL_ANALYSIS and CLIENT_POLICY documents to a topic', async () => {
    await linkComplianceDocument({ userId: adminId, role: 'ADMIN' }, { clientId, requirementKey: 'GDPR_GENERAL_SCOPE', documentId: internalDocumentId, audience: 'INTERNAL_ANALYSIS' });
    await linkComplianceDocument({ userId: adminId, role: 'ADMIN' }, { clientId, requirementKey: 'GDPR_GENERAL_SCOPE', documentId, audience: 'CLIENT_POLICY' });

    const list = await listComplianceDocuments({ userId: adminId, role: 'ADMIN' }, clientId);
    const gdpr = list.topics.find((topic) => topic.requirementKey === 'GDPR_GENERAL_SCOPE');
    expect(gdpr).toBeDefined();
    expect(gdpr!.internalAnalysis.length).toBe(1);
    expect(gdpr!.clientPolicy.length).toBe(1);
  });

  it('never exposes INTERNAL_ANALYSIS or unpublished CLIENT_POLICY through the client read model', async () => {
    const read = await getClientSafeComplianceReadModel(clientId, true, false);
    const gdpr = read.topics.find((topic) => topic.topicId === 'portal/gdpr-general-scope');
    if (gdpr) {
      expect(gdpr.documents).toEqual([]);
    }
    const serialized = JSON.stringify(read);
    expect(serialized).not.toContain('GDPR belső elemzés');
    expect(serialized).not.toContain(internalDocumentId);
  });

  it('exposes CLIENT_POLICY only after explicit publication', async () => {
    const publication = await db.clientDocumentPublication.create({
      data: {
        caseId,
        clientId,
        documentId,
        documentVersionId: (await db.documentVersion.findFirst({ where: { documentId } }))!.id,
        status: 'PUBLISHED',
        clientFacingTitle: 'Adatkezelési és adatvédelmi szabályzat',
        preparedById: adminId,
        publishedAt: new Date(),
        audienceSnapshot: {},
        sourceFingerprint: 'compliance-doc-test',
      } as never,
    });

    const read = await getClientSafeComplianceReadModel(clientId, true, false);
    const gdpr = read.topics.find((topic) => topic.topicId === 'portal/gdpr-general-scope');
    if (gdpr) {
      expect(gdpr.documents.some((doc) => doc.publicationId === publication.id)).toBe(true);
      expect(gdpr.documents.every((doc) => doc.title === 'Adatkezelési és adatvédelmi szabályzat')).toBe(true);
    }
    expect(JSON.stringify(read)).not.toContain('GDPR belső elemzés');
  });

  it('revoked publication becomes invisible and unlink removes links', async () => {
    await db.clientDocumentPublication.updateMany({ where: { clientId, documentId }, data: { revokedAt: new Date(), status: 'SUPERSEDED' } });
    const read = await getClientSafeComplianceReadModel(clientId, true, false);
    const gdpr = read.topics.find((topic) => topic.topicId === 'portal/gdpr-general-scope');
    if (gdpr) {
      expect(gdpr.documents).toEqual([]);
    }

    const links = await db.complianceDocument.findMany({ where: { document: { clientId } } });
    for (const link of links) {
      await unlinkComplianceDocument({ userId: adminId, role: 'ADMIN' }, { clientId, complianceDocumentId: link.id });
    }
    const after = await listComplianceDocuments({ userId: adminId, role: 'ADMIN' }, clientId);
    expect(after.topics.find((topic) => topic.requirementKey === 'GDPR_GENERAL_SCOPE')?.clientPolicy.length ?? 0).toBe(0);
  });
});
