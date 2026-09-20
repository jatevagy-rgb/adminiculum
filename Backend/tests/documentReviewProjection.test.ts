import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import {
  deriveNextAction,
  getDocumentReviewProjection,
  getCaseDocumentReviewSummaries,
  matchAndRankAiDrafts,
  parseBoundedInt,
  DocumentReviewProjectionDto,
} from '../src/modules/documents/reviewProjection.service';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = { userId: 'user-lawyer-1', email: 'lawyer@example.com', role: 'LAWYER', authProvider: 'local-jwt' };
    next();
  },
}));

jest.mock('../src/middleware/workforceAuthorization', () => ({
  requireWorkforceUser: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

jest.mock('../src/modules/documents/authorization', () => ({
  requireDocumentReadAccess: (req: Request, res: Response, next: NextFunction) => {
    const docId = String(req.params.id || '');
    if (docId === 'doc-forbidden') {
      res.status(403).json({ status: 403, code: 'DOCUMENT_ACCESS_FORBIDDEN', message: 'Forbidden' });
      return;
    }
    if (docId === 'doc-missing') {
      res.status(404).json({ status: 404, code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' });
      return;
    }
    next();
  },
  requireDocumentManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireHrConfidentialReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  hrConfidentialReadAllowed: () => true,
}));

jest.mock('../src/modules/cases/authorization', () => ({
  requireCaseReadAccess: (req: Request, res: Response, next: NextFunction) => {
    const caseId = String(req.params.caseId || '');
    if (caseId === 'case-forbidden') {
      res.status(403).json({ status: 403, code: 'CASE_ACCESS_FORBIDDEN', message: 'Forbidden' });
      return;
    }
    next();
  },
  requireCaseManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireCaseCollaboratorManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  userCanReadCase: () => Promise.resolve(true),
  userCanManageCase: () => Promise.resolve(true),
  getCaseReadScope: () => null,
}));

import documentRoutes from '../src/modules/documents/routes';
import casesRoutes from '../src/modules/cases/routes';

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/documents', documentRoutes);
  app.use('/api/v1/cases', casesRoutes);
  return app;
}

function requestJson(app: Express, reqPath: string, authenticated = true): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('no address'));
        return;
      }
      const r = http.request(
        {
          host: '127.0.0.1',
          port: address.port,
          path: reqPath,
          method: 'GET',
          headers: authenticated ? { authorization: 'Bearer test-token' } : {},
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode || 0, body: data ? JSON.parse(data) : null });
          });
        }
      );
      r.on('error', (e) => {
        server.close();
        reject(e);
      });
      r.end();
    });
  });
}

describe('Document Review Projection Unit & Behavioral Tests', () => {
  describe('deriveNextAction pure logic', () => {
    it('returns UPLOAD_VERSION when currentVersion is missing', () => {
      const action = deriveNextAction({
        currentVersion: null,
        previousVersion: null,
        review: null,
        comparison: null,
        ai: null,
      });
      expect(action.code).toBe('UPLOAD_VERSION');
    });

    it('returns SECURITY_THREAT when securityScanStatus is INFECTED', () => {
      const action = deriveNextAction({
        currentVersion: {
          id: 'v1',
          version: 1,
          fileName: 'f.pdf',
          mimeType: 'application/pdf',
          size: 100,
          securityScanStatus: 'INFECTED',
          createdAt: new Date().toISOString(),
        },
        previousVersion: null,
        review: null,
        comparison: null,
        ai: null,
      });
      expect(action.code).toBe('SECURITY_THREAT');
    });

    it('returns AWAITING_SECURITY_SCAN when securityScanStatus is PENDING_SCAN', () => {
      const action = deriveNextAction({
        currentVersion: {
          id: 'v1',
          version: 1,
          fileName: 'f.pdf',
          mimeType: 'application/pdf',
          size: 100,
          securityScanStatus: 'PENDING_SCAN',
          createdAt: new Date().toISOString(),
        },
        previousVersion: null,
        review: null,
        comparison: null,
        ai: null,
      });
      expect(action.code).toBe('AWAITING_SECURITY_SCAN');
    });

    it('returns RUN_COMPARISON when previousVersion exists but comparison is null', () => {
      const action = deriveNextAction({
        currentVersion: { id: 'v2', version: 2, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 90, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        review: null,
        comparison: null,
        ai: null,
      });
      expect(action.code).toBe('RUN_COMPARISON');
    });

    it('returns COMPARISON_PROCESSING when comparison is PROCESSING', () => {
      const action = deriveNextAction({
        currentVersion: { id: 'v2', version: 2, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 90, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        review: null,
        comparison: {
          comparisonId: 'comp-1',
          status: 'PROCESSING',
          baseVersionId: 'v1',
          targetVersionId: 'v2',
          totalSegments: 0,
          reviewedSegments: 0,
          unresolvedSegments: 0,
          segmentStates: { unreviewed: 0, accepted: 0, rejected: 0, needsDiscussion: 0, notRelevant: 0 },
          counts: { insertCount: 0, deleteCount: 0, replaceCount: 0, formatOnlyCount: 0, moveCandidateCount: 0 },
          categories: {},
        },
        ai: null,
      });
      expect(action.code).toBe('COMPARISON_PROCESSING');
    });

    it('returns COMPARISON_FAILED when comparison failed', () => {
      const action = deriveNextAction({
        currentVersion: { id: 'v2', version: 2, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 90, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        review: null,
        comparison: {
          comparisonId: 'comp-1',
          status: 'FAILED',
          baseVersionId: 'v1',
          targetVersionId: 'v2',
          totalSegments: 0,
          reviewedSegments: 0,
          unresolvedSegments: 0,
          segmentStates: { unreviewed: 0, accepted: 0, rejected: 0, needsDiscussion: 0, notRelevant: 0 },
          counts: { insertCount: 0, deleteCount: 0, replaceCount: 0, formatOnlyCount: 0, moveCandidateCount: 0 },
          categories: {},
        },
        ai: null,
      });
      expect(action.code).toBe('COMPARISON_FAILED');
    });

    it('returns START_REVIEW when review is null for current version', () => {
      const action = deriveNextAction({
        currentVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: null,
        review: null,
        comparison: null,
        ai: null,
      });
      expect(action.code).toBe('START_REVIEW');
    });

    it('returns CHANGES_REQUESTED when review.status is CHANGES_REQUESTED', () => {
      const action = deriveNextAction({
        currentVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: null,
        review: {
          reviewId: 'r1',
          documentVersionId: 'v1',
          reviewVersionId: 'v1',
          status: 'CHANGES_REQUESTED',
          reviewer: null,
          openPointCount: 1,
          blockingPointCount: 0,
          pointsLinkedToSegmentsCount: 0,
          openPointsLinkedToSegmentsCount: 0,
          dueAt: null,
          currentRoundNumber: 1,
          updatedAt: new Date().toISOString(),
        },
        comparison: null,
        ai: null,
      });
      expect(action.code).toBe('CHANGES_REQUESTED');
    });

    it('returns RESOLVE_BLOCKING_POINTS when review has open blocking points', () => {
      const action = deriveNextAction({
        currentVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: null,
        review: {
          reviewId: 'r1',
          documentVersionId: 'v1',
          reviewVersionId: 'v1',
          status: 'IN_REVIEW',
          reviewer: null,
          openPointCount: 2,
          blockingPointCount: 1,
          pointsLinkedToSegmentsCount: 0,
          openPointsLinkedToSegmentsCount: 0,
          dueAt: null,
          currentRoundNumber: 1,
          updatedAt: new Date().toISOString(),
        },
        comparison: null,
        ai: null,
      });
      expect(action.code).toBe('RESOLVE_BLOCKING_POINTS');
    });

    it('distinguishes segment-level discussion from document-level review transition', () => {
      // Comparison has unresolved segments (e.g. NEEDS_DISCUSSION / REJECTED), but DocumentReview.status is still IN_REVIEW
      const action = deriveNextAction({
        currentVersion: { id: 'v2', version: 2, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 90, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        review: {
          reviewId: 'r2',
          documentVersionId: 'v2',
          reviewVersionId: 'v2',
          status: 'IN_REVIEW', // Still IN_REVIEW, not CHANGES_REQUESTED!
          reviewer: null,
          openPointCount: 0,
          blockingPointCount: 0,
          pointsLinkedToSegmentsCount: 0,
          openPointsLinkedToSegmentsCount: 0,
          dueAt: null,
          currentRoundNumber: 1,
          updatedAt: new Date().toISOString(),
        },
        comparison: {
          comparisonId: 'comp-1',
          status: 'READY',
          baseVersionId: 'v1',
          targetVersionId: 'v2',
          totalSegments: 3,
          reviewedSegments: 1,
          unresolvedSegments: 2, // 2 unresolved segments
          segmentStates: { unreviewed: 1, accepted: 1, rejected: 1, needsDiscussion: 0, notRelevant: 0 },
          counts: { insertCount: 2, deleteCount: 1, replaceCount: 0, formatOnlyCount: 0, moveCandidateCount: 0 },
          categories: { OBLIGATION: 2 },
        },
        ai: null,
      });
      expect(action.code).toBe('REVIEW_CHANGE_SEGMENTS');
    });

    it('returns APPROVE_REVIEW when review is IN_REVIEW even if AI draft is present in AI_DRAFT status (AI does not gate review)', () => {
      const action = deriveNextAction({
        currentVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: null,
        review: {
          reviewId: 'r1',
          documentVersionId: 'v1',
          reviewVersionId: 'v1',
          status: 'IN_REVIEW',
          reviewer: null,
          openPointCount: 0,
          blockingPointCount: 0,
          pointsLinkedToSegmentsCount: 0,
          openPointsLinkedToSegmentsCount: 0,
          dueAt: null,
          currentRoundNumber: 1,
          updatedAt: new Date().toISOString(),
        },
        comparison: null,
        ai: {
          promptDraftId: 'draft-1',
          status: 'AI_DRAFT',
          templateKey: 'CONTRACT_RISK',
          templateVersion: 1,
          sourceDocumentVersionIds: ['v1'],
          sourceMode: 'CURRENT_VERSION',
          approved: false, // NOT lawyer approved
          artifactAvailability: { hasImportedResponse: true, hasRehydratedResponse: true },
          verifiedAt: null,
          approvedAt: null,
          updatedAt: new Date().toISOString(),
        },
      });
      expect(action.code).toBe('APPROVE_REVIEW');
    });

    it('returns APPROVE_REVIEW when all points/segments resolved and AI draft is approved', () => {
      const action = deriveNextAction({
        currentVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: null,
        review: {
          reviewId: 'r1',
          documentVersionId: 'v1',
          reviewVersionId: 'v1',
          status: 'IN_REVIEW',
          reviewer: null,
          openPointCount: 0,
          blockingPointCount: 0,
          pointsLinkedToSegmentsCount: 0,
          openPointsLinkedToSegmentsCount: 0,
          dueAt: null,
          currentRoundNumber: 1,
          updatedAt: new Date().toISOString(),
        },
        comparison: null,
        ai: {
          promptDraftId: 'draft-1',
          status: 'LAWYER_APPROVED',
          templateKey: 'CONTRACT_RISK',
          templateVersion: 1,
          sourceDocumentVersionIds: ['v1'],
          sourceMode: 'CURRENT_VERSION',
          approved: true, // LAWYER APPROVED
          artifactAvailability: { hasImportedResponse: true, hasRehydratedResponse: true },
          verifiedAt: new Date().toISOString(),
          approvedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      expect(action.code).toBe('APPROVE_REVIEW');
    });

    it('returns READY_FOR_CLIENT when review is APPROVED', () => {
      const action = deriveNextAction({
        currentVersion: { id: 'v1', version: 1, fileName: 'f.pdf', mimeType: 'application/pdf', size: 100, securityScanStatus: 'CLEAN', createdAt: new Date().toISOString() },
        previousVersion: null,
        review: {
          reviewId: 'r1',
          documentVersionId: 'v1',
          reviewVersionId: 'v1',
          status: 'APPROVED',
          reviewer: null,
          openPointCount: 0,
          blockingPointCount: 0,
          pointsLinkedToSegmentsCount: 0,
          openPointsLinkedToSegmentsCount: 0,
          dueAt: null,
          currentRoundNumber: 1,
          updatedAt: new Date().toISOString(),
        },
        comparison: null,
        ai: null,
      });
      expect(action.code).toBe('READY_FOR_CLIENT');
    });
  });

  describe('getDocumentReviewProjection database mock tests', () => {
    it('enforces exact review-version binding and prevents cross-version misattribution (Clarification 1)', async () => {
      // Document has v1 and v2.
      // v1 had a review (APPROVED).
      // v2 has NO review yet.
      // Projection for current v2 must NOT report v1 review as belonging to v2!
      const mockPrisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-1',
            caseId: 'case-1',
            name: 'Megallapodas.docx',
            fileName: 'Megallapodas.docx',
            title: 'Kétoldalú megállapodás',
            category: 'CONTRACT',
            workStatus: 'IN_PROGRESS',
          }),
        },
        documentVersion: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'v2', version: 2, originalFileName: 'Megallapodas_v2.docx', name: 'Megallapodas_v2.docx', mimeType: 'application/docx', size: 2000, isCurrent: true, previousVersionId: 'v1', securityScanStatus: 'CLEAN', createdAt: new Date('2026-09-02') },
            { id: 'v1', version: 1, originalFileName: 'Megallapodas_v1.docx', name: 'Megallapodas_v1.docx', mimeType: 'application/docx', size: 1800, isCurrent: false, previousVersionId: null, securityScanStatus: 'CLEAN', createdAt: new Date('2026-09-01') },
          ]),
        },
        documentReview: {
          findFirst: jest.fn().mockImplementation((args: any) => {
            // When querying for current version v2: return null!
            if (args.where?.documentVersionId === 'v2') {
              return null;
            }
            // When querying for other version: return the old v1 review!
            if (args.where?.documentVersionId?.not === 'v2') {
              return {
                id: 'review-v1',
                documentVersionId: 'v1',
                status: 'APPROVED',
                documentVersion: { version: 1 },
              };
            }
            return null;
          }),
        },
        documentComparison: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        documentChangeSegment: {
          groupBy: jest.fn().mockResolvedValue([]),
        },
        aiPromptDraft: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const projection = await getDocumentReviewProjection('doc-1', { prisma: mockPrisma });
      expect(projection).not.toBeNull();
      expect(projection!.currentVersion?.version).toBe(2);
      expect(projection!.previousVersion?.version).toBe(1);

      // EXACT REVIEW-VERSION BINDING:
      // Review must NOT be attributed to v2!
      expect(projection!.review).toBeNull();
      // Awareness of other version review must be explicit:
      expect(projection!.reviewContext.hasReviewForOtherVersion).toBe(true);
      expect(projection!.reviewContext.otherVersionReview).toEqual({
        reviewId: 'review-v1',
        documentVersionId: 'v1',
        versionNumber: 1,
        status: 'APPROVED',
      });
      // Next action must be to start review for v2, NOT treat it as already approved:
      expect(projection!.nextAction.code).toBe('RUN_COMPARISON');
    });

    it('correctly reports review when bound to the current version', async () => {
      const mockPrisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-1',
            caseId: 'case-1',
            name: 'Megallapodas.docx',
            fileName: 'Megallapodas.docx',
            title: 'Kétoldalú megállapodás',
            category: 'CONTRACT',
            workStatus: 'IN_PROGRESS',
          }),
        },
        documentVersion: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'v2', version: 2, originalFileName: 'Megallapodas_v2.docx', name: 'Megallapodas_v2.docx', mimeType: 'application/docx', size: 2000, isCurrent: true, previousVersionId: 'v1', securityScanStatus: 'CLEAN', createdAt: new Date('2026-09-02') },
          ]),
        },
        documentReview: {
          findFirst: jest.fn().mockImplementation((args: any) => {
            if (args.where?.documentVersionId === 'v2') {
              return {
                id: 'review-v2',
                documentVersionId: 'v2',
                status: 'IN_REVIEW',
                assignedReviewer: { id: 'u1', name: 'dr. Ügyvéd', email: 'u@example.com' },
                points: [
                  { id: 'pt-1', status: 'OPEN', severity: 'NORMAL', comparisonSegmentId: 'seg-1' },
                  { id: 'pt-2', status: 'RESOLVED', severity: 'BLOCKING', comparisonSegmentId: null },
                ],
                currentRoundNumber: 2,
                dueAt: new Date('2026-09-10'),
                updatedAt: new Date('2026-09-03'),
              };
            }
            return null;
          }),
        },
        documentComparison: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
        documentChangeSegment: {
          groupBy: jest.fn().mockResolvedValue([]),
        },
        aiPromptDraft: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const projection = await getDocumentReviewProjection('doc-1', { prisma: mockPrisma });
      expect(projection).not.toBeNull();
      expect(projection!.review).not.toBeNull();
      expect(projection!.review!.reviewId).toBe('review-v2');
      expect(projection!.review!.documentVersionId).toBe('v2');
      expect(projection!.review!.reviewVersionId).toBe('v2');
      expect(projection!.review!.status).toBe('IN_REVIEW');
      expect(projection!.review!.openPointCount).toBe(1);
      expect(projection!.review!.blockingPointCount).toBe(0);
      expect(projection!.review!.pointsLinkedToSegmentsCount).toBe(1);
      expect(projection!.reviewContext.boundToCurrentVersion).toBe(true);
    });

    it('protects against data leaks (no rehydrationMap, no internal notes, no storageReference)', async () => {
      const mockPrisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-1',
            caseId: 'case-1',
            name: 'Szerződés.pdf',
            fileName: 'Szerződés.pdf',
            title: 'Szerződés',
            category: 'CONTRACT',
            workStatus: 'IN_PROGRESS',
          }),
        },
        documentVersion: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'v1', version: 1, originalFileName: 'Szerződés.pdf', name: 'Szerződés.pdf', mimeType: 'application/pdf', size: 1000, isCurrent: true, previousVersionId: null, securityScanStatus: 'CLEAN', storageReference: 'SECRET_SHAREPOINT_DRIVE_ITEM_123', createdAt: new Date() },
          ]),
        },
        documentReview: { findFirst: jest.fn().mockResolvedValue(null) },
        documentComparison: { findFirst: jest.fn().mockResolvedValue(null) },
        documentChangeSegment: { groupBy: jest.fn().mockResolvedValue([]) },
        aiPromptDraft: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'draft-ai-1',
              status: 'AI_DRAFT',
              promptTemplateStableKey: 'CONTRACT_ANALYSIS',
              promptTemplateVersion: 1,
              sourceDocumentVersionIds: JSON.stringify(['v1']),
              sourceDocumentIds: JSON.stringify(['doc-1']),
              importedResponse: 'AI text analysis',
              rehydratedResponse: 'Rehydrated text',
              rehydrationMap: { CLIENT_NAME: 'Secret Client Co.' },
              externalPromptText: 'Secret raw prompt with PII',
              reviewerNotes: 'Secret internal lawyer note',
              verifiedAt: null,
              approvedAt: null,
              updatedAt: new Date(),
            },
          ]),
        },
      };

      const projection = await getDocumentReviewProjection('doc-1', { prisma: mockPrisma });
      expect(projection).not.toBeNull();
      const serialized = JSON.stringify(projection);

      // Verify strict privacy guarantees:
      expect(serialized).not.toContain('Secret Client Co.');
      expect(serialized).not.toContain('rehydrationMap');
      expect(serialized).not.toContain('Secret raw prompt with PII');
      expect(serialized).not.toContain('externalPromptText');
      expect(serialized).not.toContain('Secret internal lawyer note');
      expect(serialized).not.toContain('SECRET_SHAREPOINT_DRIVE_ITEM_123');
      expect(serialized).not.toContain('storageReference');

      // But safe public projection fields ARE present:
      expect(projection!.ai).not.toBeNull();
      expect(projection!.ai!.promptDraftId).toBe('draft-ai-1');
      expect(projection!.ai!.status).toBe('AI_DRAFT');
      expect(projection!.ai!.approved).toBe(false);
      expect(projection!.ai!.artifactAvailability.hasImportedResponse).toBe(true);
      expect(projection!.ai!.artifactAvailability.hasRehydratedResponse).toBe(true);
    });

    it('degrades safely when optional comparison or review records are absent', async () => {
      const mockPrisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-empty',
            caseId: 'case-1',
            name: 'Empty.pdf',
            fileName: 'Empty.pdf',
            title: 'Üres dokumentum',
            category: 'OTHER',
            workStatus: 'RECEIVED',
          }),
        },
        documentVersion: {
          findMany: jest.fn().mockResolvedValue([]), // No versions!
        },
        documentReview: { findFirst: jest.fn().mockResolvedValue(null) },
        documentComparison: { findFirst: jest.fn().mockResolvedValue(null) },
        documentChangeSegment: { groupBy: jest.fn().mockResolvedValue([]) },
        aiPromptDraft: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const projection = await getDocumentReviewProjection('doc-empty', { prisma: mockPrisma });
      expect(projection).not.toBeNull();
      expect(projection!.currentVersion).toBeNull();
      expect(projection!.previousVersion).toBeNull();
      expect(projection!.review).toBeNull();
      expect(projection!.comparison).toBeNull();
      expect(projection!.ai).toBeNull();
      expect(projection!.nextAction.code).toBe('UPLOAD_VERSION');
    });
  });

  describe('AI Draft Version-Truthful Matching & Ranking (Issue 1)', () => {
    it('selects v1/v2 AI_DRAFT over older v1 LAWYER_APPROVED when current is v2 (relevance before status)', () => {
      const draftV1Approved = {
        id: 'draft-v1-approved',
        status: 'LAWYER_APPROVED',
        promptTemplateStableKey: 'CONTRACT_RISK',
        promptTemplateVersion: 1,
        sourceDocumentVersionIds: JSON.stringify(['v1']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date('2026-09-01'),
      };
      const draftPairAi = {
        id: 'draft-v1-v2-pair',
        status: 'AI_DRAFT',
        promptTemplateStableKey: 'CONTRACT_COMPARE',
        promptTemplateVersion: 1,
        sourceDocumentVersionIds: JSON.stringify(['v1', 'v2']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date('2026-09-02'),
      };

      const matched = matchAndRankAiDrafts({
        drafts: [draftV1Approved, draftPairAi],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });

      expect(matched).not.toBeNull();
      expect(matched!.draft.id).toBe('draft-v1-v2-pair');
      expect(matched!.sourceMode).toBe('EXACT_VERSION_PAIR');
      expect(matched!.draft.status).toBe('AI_DRAFT');
    });

    it('discards drafts matching only previousVersionId (does not misattribute old version AI state)', () => {
      const draftPreviousOnly = {
        id: 'draft-v1-only',
        status: 'LAWYER_APPROVED',
        promptTemplateStableKey: 'CONTRACT_RISK',
        promptTemplateVersion: 1,
        sourceDocumentVersionIds: JSON.stringify(['v1']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date('2026-09-01'),
      };

      const matched = matchAndRankAiDrafts({
        drafts: [draftPreviousOnly],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });

      expect(matched).toBeNull();
    });

    it('prefers exact current-version draft (CURRENT_VERSION) over legacy document-level draft (LEGACY_DOCUMENT)', () => {
      const draftLegacy = {
        id: 'draft-legacy',
        status: 'LAWYER_APPROVED',
        promptTemplateStableKey: 'GENERIC_ANALYSIS',
        promptTemplateVersion: 1,
        sourceDocumentVersionIds: JSON.stringify([]),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date('2026-09-05'),
      };
      const draftCurrent = {
        id: 'draft-v2-current',
        status: 'AI_DRAFT',
        promptTemplateStableKey: 'VERSION_ANALYSIS',
        promptTemplateVersion: 1,
        sourceDocumentVersionIds: JSON.stringify(['v2']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date('2026-09-01'),
      };

      const matched = matchAndRankAiDrafts({
        drafts: [draftLegacy, draftCurrent],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });

      expect(matched).not.toBeNull();
      expect(matched!.draft.id).toBe('draft-v2-current');
      expect(matched!.sourceMode).toBe('CURRENT_VERSION');
    });

    it('matches legacy document-level draft only if no version IDs are attached', () => {
      const draftLegacy = {
        id: 'draft-legacy-doc',
        status: 'AI_DRAFT',
        promptTemplateStableKey: 'GENERIC_ANALYSIS',
        promptTemplateVersion: 1,
        sourceDocumentVersionIds: JSON.stringify([]),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date('2026-09-01'),
      };

      const matched = matchAndRankAiDrafts({
        drafts: [draftLegacy],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });

      expect(matched).not.toBeNull();
      expect(matched!.draft.id).toBe('draft-legacy-doc');
      expect(matched!.sourceMode).toBe('LEGACY_DOCUMENT');
    });

    it('labels [v1, v2] as EXACT_VERSION_PAIR when previous=v1, current=v2', () => {
      const draft = {
        id: 'draft-exact',
        status: 'AI_DRAFT',
        sourceDocumentVersionIds: JSON.stringify(['v1', 'v2']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date(),
      };
      const matched = matchAndRankAiDrafts({
        drafts: [draft],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });
      expect(matched?.sourceMode).toBe('EXACT_VERSION_PAIR');
    });

    it('normalizes duplicates: [v1, v2, v2] is recognized as EXACT_VERSION_PAIR', () => {
      const draft = {
        id: 'draft-exact-dup',
        status: 'AI_DRAFT',
        sourceDocumentVersionIds: JSON.stringify(['v1', 'v2', 'v2']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date(),
      };
      const matched = matchAndRankAiDrafts({
        drafts: [draft],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });
      expect(matched?.sourceMode).toBe('EXACT_VERSION_PAIR');
      expect(matched?.sourceDocumentVersionIds).toEqual(['v1', 'v2']);
    });

    it('labels [v2] as CURRENT_VERSION', () => {
      const draft = {
        id: 'draft-cur',
        status: 'AI_DRAFT',
        sourceDocumentVersionIds: JSON.stringify(['v2']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date(),
      };
      const matched = matchAndRankAiDrafts({
        drafts: [draft],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });
      expect(matched?.sourceMode).toBe('CURRENT_VERSION');
    });

    it('labels [v0, v1, v2] as MIXED_VERSION_CONTEXT (extra versions invalidate exact pair)', () => {
      const draft = {
        id: 'draft-mixed-3',
        status: 'AI_DRAFT',
        sourceDocumentVersionIds: JSON.stringify(['v0', 'v1', 'v2']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date(),
      };
      const matched = matchAndRankAiDrafts({
        drafts: [draft],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });
      expect(matched?.sourceMode).toBe('MIXED_VERSION_CONTEXT');
    });

    it('labels [v2, otherDocumentVersion] as MIXED_VERSION_CONTEXT', () => {
      const draft = {
        id: 'draft-mixed-other',
        status: 'AI_DRAFT',
        sourceDocumentVersionIds: JSON.stringify(['v2', 'ver-other-doc']),
        sourceDocumentIds: JSON.stringify(['doc-1', 'doc-2']),
        updatedAt: new Date(),
      };
      const matched = matchAndRankAiDrafts({
        drafts: [draft],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });
      expect(matched?.sourceMode).toBe('MIXED_VERSION_CONTEXT');
    });

    it('ignores [v1] for current v2', () => {
      const draft = {
        id: 'draft-v1',
        status: 'AI_DRAFT',
        sourceDocumentVersionIds: JSON.stringify(['v1']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date(),
      };
      const matched = matchAndRankAiDrafts({
        drafts: [draft],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });
      expect(matched).toBeNull();
    });

    it('reports approval factually on MIXED_VERSION_CONTEXT without claiming exact pair', () => {
      const draft = {
        id: 'draft-mixed-approved',
        status: 'LAWYER_APPROVED',
        sourceDocumentVersionIds: JSON.stringify(['v0', 'v1', 'v2']),
        sourceDocumentIds: JSON.stringify(['doc-1']),
        updatedAt: new Date(),
      };
      const matched = matchAndRankAiDrafts({
        drafts: [draft],
        documentId: 'doc-1',
        currentVersionId: 'v2',
        previousVersionId: 'v1',
      });
      expect(matched?.sourceMode).toBe('MIXED_VERSION_CONTEXT');
      expect(matched?.draft.status).toBe('LAWYER_APPROVED');
    });

    it('REQUIRED TEST: review=IN_REVIEW, points=0, comparison.unresolved=0, ai=AI_DRAFT => nextAction is APPROVE_REVIEW', async () => {
      const mockPrisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-ai-gate',
            caseId: 'case-1',
            title: 'Szerződés',
            fileName: 'doc.pdf',
            category: 'CONTRACT',
            workStatus: 'IN_PROGRESS',
          }),
        },
        documentVersion: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'v2', version: 2, originalFileName: 'v2.pdf', name: 'v2.pdf', mimeType: 'application/pdf', size: 1000, isCurrent: true, previousVersionId: 'v1', securityScanStatus: 'CLEAN', createdAt: new Date() },
            { id: 'v1', version: 1, originalFileName: 'v1.pdf', name: 'v1.pdf', mimeType: 'application/pdf', size: 900, isCurrent: false, previousVersionId: null, securityScanStatus: 'CLEAN', createdAt: new Date() },
          ]),
        },
        documentReview: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'review-1',
            documentVersionId: 'v2',
            status: 'IN_REVIEW',
            points: [], // openPointCount = 0, blockingPointCount = 0
            currentRoundNumber: 1,
            dueAt: null,
            updatedAt: new Date(),
          }),
        },
        documentComparison: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'comp-1',
            baseVersionId: 'v1',
            targetVersionId: 'v2',
            status: 'READY',
            totalSegmentCount: 2,
            reviewedSegmentCount: 2,
            insertCount: 1,
            deleteCount: 1,
            replaceCount: 0,
            formatOnlyCount: 0,
            moveCandidateCount: 0,
          }),
        },
        documentChangeSegment: {
          groupBy: jest.fn().mockResolvedValue([
            { reviewState: 'ACCEPTED', _count: { _all: 2 } }, // unresolvedSegments = 0
          ]),
        },
        aiPromptDraft: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'draft-ai-1',
              status: 'AI_DRAFT', // AI_DRAFT!
              promptTemplateStableKey: 'CONTRACT_COMPARE',
              promptTemplateVersion: 1,
              sourceDocumentVersionIds: JSON.stringify(['v1', 'v2']),
              sourceDocumentIds: JSON.stringify(['doc-ai-gate']),
              importedResponse: 'AI text',
              rehydratedResponse: null,
              verifiedAt: null,
              approvedAt: null,
              updatedAt: new Date(),
            },
          ]),
        },
      };

      const projection = await getDocumentReviewProjection('doc-ai-gate', { prisma: mockPrisma });
      expect(projection).not.toBeNull();
      // 1. nextAction.code MUST be APPROVE_REVIEW (AI draft did NOT block legal workflow approval)
      expect(projection!.nextAction.code).toBe('APPROVE_REVIEW');
      // 2. AI projection MUST still be present and truthfully show AI_DRAFT
      expect(projection!.ai).not.toBeNull();
      expect(projection!.ai!.promptDraftId).toBe('draft-ai-1');
      expect(projection!.ai!.status).toBe('AI_DRAFT');
      expect(projection!.ai!.sourceMode).toBe('EXACT_VERSION_PAIR');
      expect(projection!.ai!.approved).toBe(false);
      expect(projection!.ai!.attentionSuggested).toBe(true);
    });
  });

  describe('Comparison Fallback Rejection (Issue 2)', () => {
    it('rejects arbitrary comparison: v0->v2 comparison is NOT used when canonical previous is v1', async () => {
      // Lineage: v0 -> v1 -> v2
      // Current: v2, Previous: v1
      // Database has comparison v0->v2 only.
      const mockPrisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-comp-test',
            caseId: 'case-1',
            name: 'Megallapodas.docx',
            fileName: 'Megallapodas.docx',
            title: 'Megállapodás',
            category: 'CONTRACT',
            workStatus: 'IN_PROGRESS',
          }),
        },
        documentVersion: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'v2', version: 2, originalFileName: 'v2.docx', name: 'v2.docx', mimeType: 'application/docx', size: 2000, isCurrent: true, previousVersionId: 'v1', securityScanStatus: 'CLEAN', createdAt: new Date('2026-09-03') },
            { id: 'v1', version: 1, originalFileName: 'v1.docx', name: 'v1.docx', mimeType: 'application/docx', size: 1900, isCurrent: false, previousVersionId: 'v0', securityScanStatus: 'CLEAN', createdAt: new Date('2026-09-02') },
            { id: 'v0', version: 0, originalFileName: 'v0.docx', name: 'v0.docx', mimeType: 'application/docx', size: 1800, isCurrent: false, previousVersionId: null, securityScanStatus: 'CLEAN', createdAt: new Date('2026-09-01') },
          ]),
        },
        documentReview: { findFirst: jest.fn().mockResolvedValue(null) },
        documentComparison: {
          findFirst: jest.fn().mockImplementation((args: any) => {
            // Service must search strictly for baseVersionId: 'v1' and targetVersionId: 'v2'
            if (args.where?.baseVersionId === 'v1' && args.where?.targetVersionId === 'v2') {
              return null; // Exact canonical pair does NOT exist
            }
            // An obsolete v0->v2 comparison exists in the DB:
            if (args.where?.targetVersionId === 'v2' && !args.where?.baseVersionId) {
              return { id: 'comp-v0-v2', baseVersionId: 'v0', targetVersionId: 'v2', status: 'READY' };
            }
            return null;
          }),
        },
        documentChangeSegment: { groupBy: jest.fn().mockResolvedValue([]) },
        aiPromptDraft: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const projection = await getDocumentReviewProjection('doc-comp-test', { prisma: mockPrisma });
      expect(projection).not.toBeNull();
      // Comparison MUST be null because v0->v2 is NOT canonical previous (v1) -> current (v2)
      expect(projection!.comparison).toBeNull();
      expect(projection!.nextAction.code).toBe('RUN_COMPARISON');
      expect(mockPrisma.documentComparison.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            baseVersionId: 'v1',
            targetVersionId: 'v2',
          }),
        })
      );
    });

    it('accepts exact canonical previousVersionId -> currentVersionId comparison', async () => {
      const mockPrisma = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-comp-ok',
            caseId: 'case-1',
            name: 'Megallapodas.docx',
            fileName: 'Megallapodas.docx',
            title: 'Megállapodás',
            category: 'CONTRACT',
            workStatus: 'IN_PROGRESS',
          }),
        },
        documentVersion: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'v2', version: 2, originalFileName: 'v2.docx', name: 'v2.docx', mimeType: 'application/docx', size: 2000, isCurrent: true, previousVersionId: 'v1', securityScanStatus: 'CLEAN', createdAt: new Date('2026-09-02') },
            { id: 'v1', version: 1, originalFileName: 'v1.docx', name: 'v1.docx', mimeType: 'application/docx', size: 1800, isCurrent: false, previousVersionId: null, securityScanStatus: 'CLEAN', createdAt: new Date('2026-09-01') },
          ]),
        },
        documentReview: { findFirst: jest.fn().mockResolvedValue(null) },
        documentComparison: {
          findFirst: jest.fn().mockImplementation((args: any) => {
            if (args.where?.baseVersionId === 'v1' && args.where?.targetVersionId === 'v2') {
              return {
                id: 'comp-v1-v2',
                baseVersionId: 'v1',
                targetVersionId: 'v2',
                status: 'READY',
                totalSegmentCount: 5,
                reviewedSegmentCount: 2,
                insertCount: 2,
                deleteCount: 1,
                replaceCount: 2,
                formatOnlyCount: 0,
                moveCandidateCount: 0,
              };
            }
            return null;
          }),
        },
        documentChangeSegment: {
          groupBy: jest.fn().mockResolvedValue([
            { reviewState: 'UNREVIEWED', _count: { _all: 3 } },
            { reviewState: 'ACCEPTED', _count: { _all: 2 } },
          ]),
        },
        aiPromptDraft: { findMany: jest.fn().mockResolvedValue([]) },
      };

      const projection = await getDocumentReviewProjection('doc-comp-ok', { prisma: mockPrisma });
      expect(projection).not.toBeNull();
      expect(projection!.comparison).not.toBeNull();
      expect(projection!.comparison!.comparisonId).toBe('comp-v1-v2');
      expect(projection!.comparison!.baseVersionId).toBe('v1');
      expect(projection!.comparison!.targetVersionId).toBe('v2');
      expect(projection!.comparison!.unresolvedSegments).toBe(3);
    });
  });

  describe('Case Workspace Batched Execution & Single Query AI Drafts (Issue 3)', () => {
    it('getCaseDocumentReviewSummaries executes single query for AI drafts and batches versions and comparisons', async () => {
      const mockPrisma = {
        document: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'doc-1', caseId: 'case-batch', title: 'Doc 1', fileName: 'doc1.pdf', category: 'CONTRACT', workStatus: 'IN_PROGRESS' },
            { id: 'doc-2', caseId: 'case-batch', title: 'Doc 2', fileName: 'doc2.pdf', category: 'MEMO', workStatus: 'RECEIVED' },
          ]),
        },
        documentVersion: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'v1-2', documentId: 'doc-1', version: 2, isCurrent: true, previousVersionId: 'v1-1', securityScanStatus: 'CLEAN', createdAt: new Date() },
            { id: 'v1-1', documentId: 'doc-1', version: 1, isCurrent: false, previousVersionId: null, securityScanStatus: 'CLEAN', createdAt: new Date() },
            { id: 'v2-1', documentId: 'doc-2', version: 1, isCurrent: true, previousVersionId: null, securityScanStatus: 'CLEAN', createdAt: new Date() },
          ]),
        },
        documentReview: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        documentComparison: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        documentChangeSegment: {
          groupBy: jest.fn().mockResolvedValue([]),
        },
        aiPromptDraft: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'draft-case-wide',
              caseId: 'case-batch',
              status: 'AI_DRAFT',
              promptTemplateStableKey: 'CONTRACT_COMPARE',
              promptTemplateVersion: 1,
              sourceDocumentVersionIds: JSON.stringify(['v1-1', 'v1-2']),
              sourceDocumentIds: JSON.stringify(['doc-1']),
              importedResponse: 'Analysis',
              rehydratedResponse: 'Rehydrated',
              verifiedAt: null,
              approvedAt: null,
              updatedAt: new Date(),
            },
          ]),
        },
      };

      const result = await getCaseDocumentReviewSummaries('case-batch', { prisma: mockPrisma });
      expect(result.items).toHaveLength(2);
      // aiPromptDraft.findMany MUST be called exactly once across the whole case (single case-wide query)
      expect(mockPrisma.aiPromptDraft.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.aiPromptDraft.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { caseId: 'case-batch' } })
      );

      // Check that doc-1 correctly received its matched AI draft in memory:
      const doc1Summary = result.items.find((i) => i.documentId === 'doc-1');
      expect(doc1Summary).toBeDefined();
      expect(doc1Summary!.aiPromptDraftId).toBe('draft-case-wide');
      expect(doc1Summary!.aiSourceMode).toBe('EXACT_VERSION_PAIR');

      // Check that doc-2 has no AI draft:
      const doc2Summary = result.items.find((i) => i.documentId === 'doc-2');
      expect(doc2Summary).toBeDefined();
      expect(doc2Summary!.aiPromptDraftId).toBeNull();
    });
  });

  describe('Bounded Query Parameter Validation (Issue 4)', () => {
    it('parseBoundedInt enforces limits and handles edge cases', () => {
      // segmentLimit bounds: min 1, max 100, default 50
      expect(parseBoundedInt(-10, 1, 100, 50)).toBe(1);
      expect(parseBoundedInt(0, 1, 100, 50)).toBe(1);
      expect(parseBoundedInt(250, 1, 100, 50)).toBe(100);
      expect(parseBoundedInt('invalid', 1, 100, 50)).toBe(50);
      expect(parseBoundedInt(undefined, 1, 100, 50)).toBe(50);
      expect(parseBoundedInt(null, 1, 100, 50)).toBe(50);
      expect(parseBoundedInt('', 1, 100, 50)).toBe(50);
      expect(parseBoundedInt(NaN, 1, 100, 50)).toBe(50);
      expect(parseBoundedInt(Infinity, 1, 100, 50)).toBe(50);
      expect(parseBoundedInt('45.9', 1, 100, 50)).toBe(45);

      // case limit bounds: min 1, max 50, default 20
      expect(parseBoundedInt(-5, 1, 50, 20)).toBe(1);
      expect(parseBoundedInt(0, 1, 50, 20)).toBe(1);
      expect(parseBoundedInt(100, 1, 50, 20)).toBe(50);
      expect(parseBoundedInt(35, 1, 50, 20)).toBe(35);
      expect(parseBoundedInt('15', 1, 50, 20)).toBe(15);
    });
  });

  describe('HTTP Route Integration Tests', () => {
    it('GET /api/v1/documents/:id/review-projection returns 401 unauthenticated', async () => {
      const res = await requestJson(createApp(), '/api/v1/documents/doc-1/review-projection', false);
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/documents/:id/review-projection returns 403 when forbidden', async () => {
      const res = await requestJson(createApp(), '/api/v1/documents/doc-forbidden/review-projection', true);
      expect(res.status).toBe(403);
    });

    it('GET /api/v1/documents/:id/review-projection returns 404 when document missing', async () => {
      const res = await requestJson(createApp(), '/api/v1/documents/doc-missing/review-projection', true);
      expect(res.status).toBe(404);
    });

    it('GET /api/v1/cases/:caseId/document-reviews returns 401 unauthenticated', async () => {
      const res = await requestJson(createApp(), '/api/v1/cases/case-1/document-reviews', false);
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/cases/:caseId/document-reviews returns 403 when forbidden', async () => {
      const res = await requestJson(createApp(), '/api/v1/cases/case-forbidden/document-reviews', true);
      expect(res.status).toBe(403);
    });
  });
});
