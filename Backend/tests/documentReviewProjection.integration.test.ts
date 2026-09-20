import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import {
  getDocumentReviewProjection,
  getCaseDocumentReviewSummaries,
} from '../src/modules/documents/reviewProjection.service';

const databaseUrl =
  process.env.REVIEW_TEST_DATABASE_URL ||
  process.env.AI_PROMPT_TEST_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/adminiculum_replay_ci?schema=public';

jest.mock('../src/prisma/prisma.service', () => {
  const { PrismaClient: TestPrismaClient } = require('@prisma/client') as typeof import('@prisma/client');
  return {
    prisma: new TestPrismaClient({
      datasources: {
        db: {
          url:
            process.env.REVIEW_TEST_DATABASE_URL ||
            process.env.AI_PROMPT_TEST_DATABASE_URL ||
            'postgresql://postgres:postgres@localhost:5432/adminiculum_replay_ci?schema=public',
        },
      },
    }),
  };
});

const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ids = {
  authorizedLawyer: 'b1000000-0000-4000-8000-000000000001',
  collaborator: 'b1000000-0000-4000-8000-000000000002',
  crossCaseLawyer: 'b1000000-0000-4000-8000-000000000003',
  client: 'b2000000-0000-4000-8000-000000000001',
  caseA: 'b3000000-0000-4000-8000-000000000001',
  caseB: 'b3000000-0000-4000-8000-000000000002',
  doc1: 'b4000000-0000-4000-8000-000000000001',
  doc2Cross: 'b4000000-0000-4000-8000-000000000002',
  v1: 'b5000000-0000-4000-8000-000000000001',
  v2: 'b5000000-0000-4000-8000-000000000002',
  vCross: 'b5000000-0000-4000-8000-000000000003',
  comparison: 'b6000000-0000-4000-8000-000000000001',
  segment1: 'b7000000-0000-4000-8000-000000000001',
  segment2: 'b7000000-0000-4000-8000-000000000002',
  reviewV1: 'b8000000-0000-4000-8000-000000000001',
  reviewV2: 'b8000000-0000-4000-8000-000000000002',
  point1: 'b9000000-0000-4000-8000-000000000001',
  aiDraft: 'ba000000-0000-4000-8000-000000000001',
};

describeWithDatabase('Document Review Projection PostgreSQL Integration', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();

    // Clean up any stale records from previous runs
    await db.documentChangeSegment.deleteMany({ where: { comparisonId: ids.comparison } }).catch(() => {});
    await db.documentComparison.deleteMany({ where: { id: ids.comparison } }).catch(() => {});
    await db.reviewPoint.deleteMany({ where: { id: ids.point1 } }).catch(() => {});
    await db.documentReview.deleteMany({ where: { id: { in: [ids.reviewV1, ids.reviewV2] } } }).catch(() => {});
    await db.aiPromptDraft.deleteMany({ where: { id: ids.aiDraft } }).catch(() => {});
    await db.documentVersion.deleteMany({ where: { id: { in: [ids.v1, ids.v2, ids.vCross] } } }).catch(() => {});
    await db.document.deleteMany({ where: { id: { in: [ids.doc1, ids.doc2Cross] } } }).catch(() => {});
    await db.caseCollaborator.deleteMany({ where: { caseId: ids.caseA } }).catch(() => {});
    await db.case.deleteMany({ where: { id: { in: [ids.caseA, ids.caseB] } } }).catch(() => {});
    await db.client.deleteMany({ where: { id: ids.client } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: [ids.authorizedLawyer, ids.collaborator, ids.crossCaseLawyer] } } }).catch(() => {});

    // Seed test users
    await db.user.createMany({
      data: [
        { id: ids.authorizedLawyer, email: 'auth-lawyer@test.invalid', name: 'Authorized Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.collaborator, email: 'collab@test.invalid', name: 'Case Collaborator', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
        { id: ids.crossCaseLawyer, email: 'cross@test.invalid', name: 'Cross Case Lawyer', role: 'LAWYER', status: 'ACTIVE', isActive: true, skills: [] },
      ],
    });

    // Seed test client and cases
    await db.client.create({ data: { id: ids.client, name: 'Projection Test Client' } });
    await db.case.createMany({
      data: [
        { id: ids.caseA, caseNumber: 'CASE-PROJ-A', title: 'Case A', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.authorizedLawyer, assignedLawyerId: ids.authorizedLawyer },
        { id: ids.caseB, caseNumber: 'CASE-PROJ-B', title: 'Case B', caseType: 'CONTRACT_REVIEW', clientId: ids.client, createdById: ids.crossCaseLawyer, assignedLawyerId: ids.crossCaseLawyer },
      ],
    });
    await db.caseCollaborator.create({ data: { caseId: ids.caseA, userId: ids.collaborator } });

    // Seed document in Case A and document in Case B
    await db.document.createMany({
      data: [
        { id: ids.doc1, name: 'Szerzodes.docx', fileName: 'Szerzodes.docx', title: 'Szállítói Megállapodás', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', caseId: ids.caseA, clientId: ids.client, currentVersion: 2, currentVersionInt: 2, version: '2' },
        { id: ids.doc2Cross, name: 'CrossCaseDoc.pdf', fileName: 'CrossCaseDoc.pdf', title: 'Cross Case Doc', category: 'CONTRACT', documentType: 'CONTRACT', mimeType: 'application/pdf', caseId: ids.caseB, clientId: ids.client, currentVersion: 1, currentVersionInt: 1, version: '1' },
      ],
    });

    // Seed versions: v1 (previous) and v2 (current) for doc1
    await db.documentVersion.createMany({
      data: [
        { id: ids.v1, documentId: ids.doc1, version: 1, name: 'Szerzodes_v1.docx', originalFileName: 'Szerzodes_v1.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1000, storageReference: 'CONFIDENTIAL_STORAGE_V1', spItemId: 'SP_ITEM_V1', isCurrent: false, uploadedById: ids.authorizedLawyer, securityScanStatus: 'CLEAN' },
        { id: ids.v2, documentId: ids.doc1, version: 2, name: 'Szerzodes_v2.docx', originalFileName: 'Szerzodes_v2.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 1200, storageReference: 'CONFIDENTIAL_STORAGE_V2', spItemId: 'SP_ITEM_V2', isCurrent: true, previousVersionId: ids.v1, uploadedById: ids.authorizedLawyer, securityScanStatus: 'CLEAN' },
        { id: ids.vCross, documentId: ids.doc2Cross, version: 1, name: 'Cross.pdf', originalFileName: 'Cross.pdf', mimeType: 'application/pdf', size: 500, storageReference: 'CONFIDENTIAL_STORAGE_CROSS', spItemId: 'SP_ITEM_CROSS', isCurrent: true, uploadedById: ids.crossCaseLawyer, securityScanStatus: 'CLEAN' },
      ],
    });

    // Seed a review specifically for v1 (APPROVED) to test exact version binding
    await db.documentReview.create({
      data: {
        id: ids.reviewV1,
        documentId: ids.doc1,
        documentVersionId: ids.v1,
        status: 'APPROVED',
        createdById: ids.authorizedLawyer,
        assignedReviewerId: ids.collaborator,
      },
    });

    // Seed comparison between v1 and v2
    await db.documentComparison.create({
      data: {
        id: ids.comparison,
        documentId: ids.doc1,
        baseVersionId: ids.v1,
        targetVersionId: ids.v2,
        status: 'READY',
        algorithmRevision: 1,
        extractionRevision: 1,
        createdById: ids.authorizedLawyer,
        totalSegmentCount: 2,
        reviewedSegmentCount: 1,
        insertCount: 1,
        deleteCount: 0,
        replaceCount: 1,
      },
    });

    // Seed change segments
    await db.documentChangeSegment.createMany({
      data: [
        { id: ids.segment1, comparisonId: ids.comparison, sequence: 0, changeType: 'REPLACE', baseExcerpt: '10 nap', targetExcerpt: '30 nap', confidence: 0.95, reviewState: 'ACCEPTED', category: 'DATE', categorySource: 'MANUAL', revision: 1 },
        { id: ids.segment2, comparisonId: ids.comparison, sequence: 1, changeType: 'INSERT', baseExcerpt: null, targetExcerpt: 'Kötbér 5%', confidence: 0.88, reviewState: 'NEEDS_DISCUSSION', category: 'LIABILITY', categorySource: 'MANUAL', revision: 1 },
      ],
    });

    // Seed AI prompt draft for doc1/caseA
    await db.aiPromptDraft.create({
      data: {
        id: ids.aiDraft,
        caseId: ids.caseA,
        promptTemplateId: 'tmpl-1',
        promptTemplateStableKey: 'CONTRACT_RISK_ASSESSMENT',
        promptTemplateVersion: 1,
        promptTemplateSnapshot: { title: 'Contract Risk' },
        sourceDocumentVersionIds: JSON.stringify([ids.v1, ids.v2]),
        sourceDocumentIds: JSON.stringify([ids.doc1]),
        selectedContext: {},
        anonymizedPreview: 'Preview with masked entities',
        externalPromptText: 'SENSITIVE_UNMASKED_EXTERNAL_PROMPT_PII',
        rehydrationMap: { CLIENT: 'Confidential Client Name' },
        anonymizationSnapshot: {},
        importedResponse: 'AI risk assessment analysis text',
        rehydratedResponse: 'Rehydrated analysis text',
        status: 'LAWYER_APPROVED',
        preparedById: ids.authorizedLawyer,
        approvedById: ids.authorizedLawyer,
        approvedAt: new Date('2026-09-20T10:00:00Z'),
        verifiedById: ids.collaborator,
        verifiedAt: new Date('2026-09-20T09:30:00Z'),
      },
    });
  });

  afterAll(async () => {
    if (db) {
      await db.documentChangeSegment.deleteMany({ where: { comparisonId: ids.comparison } }).catch(() => {});
      await db.documentComparison.deleteMany({ where: { id: ids.comparison } }).catch(() => {});
      await db.reviewPoint.deleteMany({ where: { id: ids.point1 } }).catch(() => {});
      await db.documentReview.deleteMany({ where: { id: { in: [ids.reviewV1, ids.reviewV2] } } }).catch(() => {});
      await db.aiPromptDraft.deleteMany({ where: { id: ids.aiDraft } }).catch(() => {});
      await db.documentVersion.deleteMany({ where: { id: { in: [ids.v1, ids.v2, ids.vCross] } } }).catch(() => {});
      await db.document.deleteMany({ where: { id: { in: [ids.doc1, ids.doc2Cross] } } }).catch(() => {});
      await db.caseCollaborator.deleteMany({ where: { caseId: ids.caseA } }).catch(() => {});
      await db.case.deleteMany({ where: { id: { in: [ids.caseA, ids.caseB] } } }).catch(() => {});
      await db.client.deleteMany({ where: { id: ids.client } }).catch(() => {});
      await db.user.deleteMany({ where: { id: { in: [ids.authorizedLawyer, ids.collaborator, ids.crossCaseLawyer] } } }).catch(() => {});
      await db.$disconnect();
    }
  });

  it('selects authoritative current version and previous version from PostgreSQL', async () => {
    const projection = await getDocumentReviewProjection(ids.doc1, { prisma: db });
    expect(projection).not.toBeNull();
    expect(projection!.documentId).toBe(ids.doc1);
    expect(projection!.caseId).toBe(ids.caseA);
    expect(projection!.documentTitle).toBe('Szállítói Megállapodás');

    expect(projection!.currentVersion).not.toBeNull();
    expect(projection!.currentVersion!.id).toBe(ids.v2);
    expect(projection!.currentVersion!.version).toBe(2);

    expect(projection!.previousVersion).not.toBeNull();
    expect(projection!.previousVersion!.id).toBe(ids.v1);
    expect(projection!.previousVersion!.version).toBe(1);
  });

  it('enforces exact review-version binding and prevents cross-version misattribution in PostgreSQL', async () => {
    // Current version is v2. Only v1 has a review (APPROVED).
    // The projection for v2 must NOT report v1 review as belonging to v2!
    const projection = await getDocumentReviewProjection(ids.doc1, { prisma: db });
    expect(projection).not.toBeNull();

    expect(projection!.review).toBeNull(); // No review for v2 yet!
    expect(projection!.reviewContext.boundToCurrentVersion).toBe(false);
    expect(projection!.reviewContext.hasReviewForOtherVersion).toBe(true);
    expect(projection!.reviewContext.otherVersionReview).toEqual({
      reviewId: ids.reviewV1,
      documentVersionId: ids.v1,
      versionNumber: 1,
      status: 'APPROVED',
    });

    // Next action must be to start review for v2, NOT claim it is approved
    expect(projection!.nextAction.code).toBe('START_REVIEW');
  });

  it('binds review to v2 when v2 gets its own review, and reports comparison segment stats', async () => {
    // Create review for v2 in IN_REVIEW status
    await db.documentReview.create({
      data: {
        id: ids.reviewV2,
        documentId: ids.doc1,
        documentVersionId: ids.v2,
        status: 'IN_REVIEW',
        createdById: ids.authorizedLawyer,
        assignedReviewerId: ids.collaborator,
      },
    });

    const projection = await getDocumentReviewProjection(ids.doc1, { prisma: db, includeSegments: true });
    expect(projection).not.toBeNull();
    expect(projection!.review).not.toBeNull();
    expect(projection!.review!.reviewId).toBe(ids.reviewV2);
    expect(projection!.review!.documentVersionId).toBe(ids.v2);
    expect(projection!.review!.status).toBe('IN_REVIEW');
    expect(projection!.review!.reviewer?.id).toBe(ids.collaborator);

    // Comparison stats
    expect(projection!.comparison).not.toBeNull();
    expect(projection!.comparison!.status).toBe('READY');
    expect(projection!.comparison!.totalSegments).toBe(2);
    expect(projection!.comparison!.reviewedSegments).toBe(1);
    expect(projection!.comparison!.unresolvedSegments).toBe(1);
    expect(projection!.comparison!.segmentStates.accepted).toBe(1);
    expect(projection!.comparison!.segmentStates.needsDiscussion).toBe(1);
    expect(projection!.comparison!.categories).toMatchObject({ DATE: 1, LIABILITY: 1 });

    // Segments array
    expect(projection!.segments).toHaveLength(2);
    expect(projection!.segments![0].changeType).toBe('REPLACE');
    expect(projection!.segments![0].reviewState).toBe('ACCEPTED');
    expect(projection!.segments![1].changeType).toBe('INSERT');
    expect(projection!.segments![1].reviewState).toBe('NEEDS_DISCUSSION');

    // Deterministic Next Action:
    // Notice: Segment 2 is NEEDS_DISCUSSION, but DocumentReview.status is still IN_REVIEW!
    // Next action should be REVIEW_CHANGE_SEGMENTS, NOT CHANGES_REQUESTED!
    expect(projection!.nextAction.code).toBe('REVIEW_CHANGE_SEGMENTS');
  });

  it('reports AI prompt draft status and strictly protects PII and internal storage IDs from leaking', async () => {
    const projection = await getDocumentReviewProjection(ids.doc1, { prisma: db });
    expect(projection).not.toBeNull();
    expect(projection!.ai).not.toBeNull();
    expect(projection!.ai!.promptDraftId).toBe(ids.aiDraft);
    expect(projection!.ai!.templateKey).toBe('CONTRACT_RISK_ASSESSMENT');
    expect(projection!.ai!.status).toBe('LAWYER_APPROVED');
    expect(projection!.ai!.approved).toBe(true);
    expect(projection!.ai!.artifactAvailability.hasImportedResponse).toBe(true);
    expect(projection!.ai!.artifactAvailability.hasRehydratedResponse).toBe(true);

    // Strict leak checks
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('Confidential Client Name');
    expect(serialized).not.toContain('rehydrationMap');
    expect(serialized).not.toContain('SENSITIVE_UNMASKED_EXTERNAL_PROMPT_PII');
    expect(serialized).not.toContain('CONFIDENTIAL_STORAGE_V1');
    expect(serialized).not.toContain('CONFIDENTIAL_STORAGE_V2');
    expect(serialized).not.toContain('SP_ITEM_V1');
  });

  it('aggregates case-level review summaries correctly in getCaseDocumentReviewSummaries', async () => {
    const caseSummary = await getCaseDocumentReviewSummaries(ids.caseA, { prisma: db });
    expect(caseSummary.caseId).toBe(ids.caseA);
    expect(caseSummary.documentCount).toBe(1);
    const item = caseSummary.items[0];
    expect(item.documentId).toBe(ids.doc1);
    expect(item.documentTitle).toBe('Szállítói Megállapodás');
    expect(item.currentVersionNumber).toBe(2);
    expect(item.previousVersionNumber).toBe(1);
    expect(item.reviewStatus).toBe('IN_REVIEW');
    expect(item.comparisonStatus).toBe('READY');
    expect(item.unresolvedSegments).toBe(1);
    expect(item.aiApproved).toBe(true);
    expect(item.nextAction.code).toBe('REVIEW_CHANGE_SEGMENTS');
  });
});
