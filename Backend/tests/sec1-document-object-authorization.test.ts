/**
 * SEC-1: Document Object Authorization Tests
 *
 * Tests cross-client isolation, cross-case denial, HR_CONFIDENTIAL boundary,
 * version/download UUID attacks, contract/template authorization, and
 * generation-draft authorization.
 *
 * Two clients, two cases, two lawyers, HR-confidential doc, standard doc,
 * versions. Real routes with mocked Prisma.
 */

// Set feature flags BEFORE any module imports (read at load time)
process.env.ENABLE_GENERATION_DRAFT = 'true';

import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

// ---------------------------------------------------------------------------
// Mock auth — sets req.user from headers
// ---------------------------------------------------------------------------
jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = {
      userId: String(req.headers['x-test-user-id'] || 'user-1'),
      email: 'test@example.com',
      role: String(req.headers['x-test-role'] || 'LAWYER') as any,
      authProvider: 'local-jwt',
    };
    next();
  },
}));

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------
const mockPrisma = {
  $transaction: jest.fn((operations: unknown[]) => Promise.all(operations as Promise<unknown>[])),
  case: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  caseCollaborator: {
    findFirst: jest.fn(),
  },
  document: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  documentVersion: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  contractGeneration: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  contractTemplate: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  comment: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  documentReviewSuggestion: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  documentAnnotation: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: mockPrisma,
}));

// ---------------------------------------------------------------------------
// Mock feature flags
// ---------------------------------------------------------------------------
jest.mock('../src/middleware/featureAvailability', () => ({
  isDatabaseFoundationEnabled: () => true,
  sendFeatureUnavailable: (_req: Request, res: Response) => {
    res.status(501).json({ error: 'Feature unavailable' });
  },
  requireDatabaseFoundation: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// ---------------------------------------------------------------------------
// Mock services — return minimal shaped data
// ---------------------------------------------------------------------------
jest.mock('../src/modules/documents/services', () => {
  const mock = {
    getCaseDocuments: jest.fn().mockResolvedValue([]),
    getDocumentById: jest.fn().mockResolvedValue({ id: 'doc-1', name: 'Test Doc' }),
    getDocumentVersion: jest.fn().mockImplementation((_docId: string, versionId: string) => {
      if (versionId === 'version-1') {
        return Promise.resolve({ id: 'version-1', version: 1 });
      }
      return Promise.resolve(null);
    }),
    searchDocuments: jest.fn().mockResolvedValue([]),
    uploadNewVersion: jest.fn().mockResolvedValue({ id: 'ver-2' }),
    submitForReview: jest.fn().mockResolvedValue(true),
    approveDocument: jest.fn().mockResolvedValue(true),
    rejectDocument: jest.fn().mockResolvedValue(true),
    deleteDocument: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, default: mock };
});

jest.mock('../src/modules/contracts/services', () => {
  const mock = {
    getCaseContracts: jest.fn().mockResolvedValue([]),
    generateWithBundle: jest.fn().mockResolvedValue({ success: true, id: 'gen-1' }),
    getContractComparison: jest.fn().mockResolvedValue({ success: true, comparison: {} }),
    getEditDraft: jest.fn().mockResolvedValue({}),
    saveEditDraft: jest.fn().mockResolvedValue({ success: true }),
    generateRevisionFromEditDraft: jest.fn().mockResolvedValue({ success: true }),
    getEditSuggestions: jest.fn().mockResolvedValue({}),
    downloadDocumentResult: jest.fn().mockResolvedValue(Buffer.from('test')),
    uploadToSharePoint: jest.fn().mockResolvedValue({ success: true }),
    cleanupExpiredPreviews: jest.fn().mockResolvedValue(0),
    finalizeContract: jest.fn().mockResolvedValue({ success: true }),
    createContractRevision: jest.fn().mockResolvedValue({ success: true }),
    downloadCaseBundle: jest.fn().mockResolvedValue({ success: true, zipBuffer: Buffer.from('zip'), fileName: 'bundle.zip' }),
    rejectApproval: jest.fn().mockResolvedValue({ success: true }),
    backToReview: jest.fn().mockResolvedValue({ success: true }),
    getContractTimeline: jest.fn().mockResolvedValue({ success: true, events: [] }),
  };
  return { __esModule: true, default: mock };
});

jest.mock('../src/modules/generation-draft/service', () => {
  const mock = {
    getDraft: jest.fn().mockResolvedValue(null),
    getDraftsByCase: jest.fn().mockResolvedValue([]),
    upsertDraft: jest.fn().mockResolvedValue({ isNew: true }),
    deleteDraft: jest.fn().mockResolvedValue(true),
    deleteAllDraftsForCase: jest.fn().mockResolvedValue(0),
  };
  return { __esModule: true, default: mock };
});

jest.mock('../src/modules/documentEditor/service', () => ({
  getDocumentEditorMetadata: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/modules/documents/documentComments.service', () => ({
  createDocumentComment: jest.fn().mockResolvedValue({ id: 'comment-1' }),
  listDocumentComments: jest.fn().mockResolvedValue([]),
  resolveDocumentComment: jest.fn().mockResolvedValue({}),
  reopenDocumentComment: jest.fn().mockResolvedValue({}),
  DocumentCommentError: class extends Error {},
}));

jest.mock('../src/modules/documents/workContext.service', () => ({
  getDocumentWorkContext: jest.fn().mockResolvedValue({}),
  updateDocumentWorkContext: jest.fn().mockResolvedValue({}),
  linkDocumentTask: jest.fn().mockResolvedValue({}),
  unlinkDocumentTask: jest.fn().mockResolvedValue({}),
  listTaskDocuments: jest.fn().mockResolvedValue([]),
  sendWorkContextError: (_res: Response, _err: unknown) => {},
}));

jest.mock('../src/modules/tasks/services', () => ({
  createTaskFromDocumentSource: jest.fn().mockResolvedValue({}),
  SourceLinkedTaskError: class extends Error {},
}));

jest.mock('../src/modules/documents/textExtractor', () => ({
  extractText: jest.fn().mockResolvedValue({ success: true, text: 'extracted text' }),
}));

// Mock SharePoint driveService
jest.mock('../src/modules/sharepoint/driveService', () => ({
  default: {
    downloadDocument: jest.fn().mockResolvedValue(Buffer.from('test')),
    downloadDocumentResult: jest.fn().mockResolvedValue(Buffer.from('test')),
  },
}));

jest.mock('../src/modules/review-notes/service', () => {
  const mock = {
    getReviewNotes: jest.fn().mockResolvedValue({
      id: 'rev-notes-1',
      generationId: 'contract-gen-1',
      overallStatus: 'NEEDS_REVISION',
      overallTitle: 'Review Title',
      overallNote: 'Review Note',
      authorId: 'lawyer-a',
      createdAt: new Date(),
      updatedAt: new Date(),
      blockNotes: [],
    }),
    upsertReviewNotes: jest.fn().mockResolvedValue({
      id: 'rev-notes-1',
      generationId: 'contract-gen-1',
      overallStatus: 'NEEDS_REVISION',
      overallTitle: 'Review Title',
      overallNote: 'Review Note',
      authorId: 'lawyer-a',
      createdAt: new Date(),
      updatedAt: new Date(),
      blockNotes: [],
    }),
  };
  return { __esModule: true, default: mock };
});

jest.mock('../src/modules/clause-library/service', () => {
  const mock = {
    listClauses: jest.fn().mockResolvedValue([]),
    getClause: jest.fn().mockResolvedValue({ id: 'clause-1', title: 'Test Clause' }),
    createClause: jest.fn().mockResolvedValue({ id: 'clause-1' }),
    updateClause: jest.fn().mockResolvedValue({ id: 'clause-1' }),
    deleteClause: jest.fn().mockResolvedValue(true),
    listLawyerProfiles: jest.fn().mockResolvedValue([]),
    getLawyerProfile: jest.fn().mockResolvedValue({ id: 'prof-1' }),
    upsertLawyerProfile: jest.fn().mockResolvedValue({ id: 'prof-1' }),
    getAssembly: jest.fn().mockResolvedValue({ id: 'assembly-1', caseId: 'case-a' }),
    recommendClauses: jest.fn().mockResolvedValue([]),
    upsertAssembly: jest.fn().mockResolvedValue({ id: 'assembly-1', caseId: 'case-a' }),
    updateAssemblyStatus: jest.fn().mockResolvedValue({ id: 'assembly-1', caseId: 'case-a' }),
    deleteAssembly: jest.fn().mockResolvedValue(true),
    getReviewGuidance: jest.fn().mockResolvedValue({
      contractType: 'ADASVETEL',
      analyzedField: 'templateData',
      detected: [],
      missing: [],
      suggested: [],
      summary: { totalDetected: 0, totalMissing: 0, totalSuggested: 0 },
    }),
  };
  return { __esModule: true, default: mock };
});

// Mock fs for contract download (file existence check)
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
  };
});

// Mock the SharePoint driveService for dynamic imports from document routes
jest.mock('../src/modules/sharepoint/driveService', () => ({
  default: {
    downloadDocument: jest.fn().mockResolvedValue(Buffer.from('test')),
    downloadDocumentResult: jest.fn().mockResolvedValue(Buffer.from('test')),
    uploadDocument: jest.fn().mockResolvedValue({ spItemId: 'mock-sp-id' }),
  },
}));

// ---------------------------------------------------------------------------
// Import routes AFTER mocks
// ---------------------------------------------------------------------------
import documentsRoutes from '../src/modules/documents/routes';
import contractsRoutes from '../src/modules/contracts/routes';
import reviewNotesRoutes from '../src/modules/review-notes/routes';
import generationDraftRoutes from '../src/modules/generation-draft/routes';
import clauseLibraryRoutes from '../src/modules/clause-library/routes';
import { prisma } from '../src/prisma/prisma.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
type TestResponse = { status: number; body: unknown };

function requestJson(
  app: Express,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error(' unavailable'));
        return;
      }

      const reqHeaders: Record<string, string> = {
        authorization: 'Bearer test-token',
        ...headers,
      };
      if (headers.authorization === '') {
        delete reqHeaders.authorization;
      }
      const encodedBody = body === undefined ? undefined : JSON.stringify(body);
      if (encodedBody) {
        reqHeaders['content-type'] = 'application/json';
        reqHeaders['content-length'] = String(Buffer.byteLength(encodedBody));
      }

      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: reqHeaders,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            server.close();
            let parsed: unknown;
            try { parsed = JSON.parse(body); } catch { parsed = body; }
            resolve({ status: res.statusCode || 0, body: parsed });
          });
        }
      );
      request.on('error', (err) => { server.close(); reject(err); });
      request.end(encodedBody);
    });
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/documents', documentsRoutes);
  app.use('/api/v1/contracts', contractsRoutes);
  app.use('/api/v1/contracts', reviewNotesRoutes);
  app.use('/api/v1/generation-drafts', generationDraftRoutes);
  app.use('/api/v1/clause-library', clauseLibraryRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const CLIENT_A = 'client-a';
const CLIENT_B = 'client-b';
const CASE_A = 'case-a';
const CASE_B = 'case-b';
const LAWYER_A = 'lawyer-a'; // assigned to Case A
const LAWYER_B = 'lawyer-b'; // assigned to Case B
const UNRELATED_LAWYER = 'unrelated-lawyer';
const ADMIN_USER = 'admin-user';
const STANDARD_DOC = 'doc-standard';
const HR_DOC = 'doc-hr-confidential';
const CASE_B_DOC = 'doc-case-b';
const VERSION_1 = 'version-1';
const VERSION_B = 'version-case-b';
const CONTRACT_GEN_1 = 'contract-gen-1';

/** Standard document in Case A */
function mockStandardDoc() {
  (prisma.document.findUnique as jest.Mock).mockImplementation((args: any) => {
    if (args.where.id === STANDARD_DOC || args.where.id === undefined) {
      return Promise.resolve({
        id: STANDARD_DOC,
        caseId: CASE_A,
        clientId: CLIENT_A,
        securityClassification: 'STANDARD',
        name: 'Standard Doc',
        spItemId: 'sp-item-1',
        mimeType: 'application/pdf',
      });
    }
    if (args.where.id === HR_DOC) {
      return Promise.resolve({
        id: HR_DOC,
        caseId: CASE_A,
        clientId: CLIENT_A,
        securityClassification: 'HR_CONFIDENTIAL',
        name: 'HR Confidential Doc',
        spItemId: 'sp-item-hr',
        mimeType: 'application/pdf',
      });
    }
    if (args.where.id === CASE_B_DOC) {
      return Promise.resolve({
        id: CASE_B_DOC,
        caseId: CASE_B,
        clientId: CLIENT_B,
        securityClassification: 'STANDARD',
        name: 'Case B Doc',
        spItemId: 'sp-item-b',
        mimeType: 'application/pdf',
      });
    }
    return Promise.resolve(null);
  });
}

/** HR_CONFIDENTIAL document in Case A */
function mockHrDoc() {
  mockStandardDoc(); // covers both
}

/** Case A — assigned to LAWYER_A */
function mockCaseA() {
  (prisma.case.findUnique as jest.Mock).mockImplementation((args: any) => {
    if (args.where.id === CASE_A) {
      return Promise.resolve({
        id: CASE_A,
        clientId: CLIENT_A,
        assignedLawyerId: LAWYER_A,
        createdById: LAWYER_A,
      });
    }
    if (args.where.id === CASE_B) {
      return Promise.resolve({
        id: CASE_B,
        clientId: CLIENT_B,
        assignedLawyerId: LAWYER_B,
        createdById: LAWYER_B,
      });
    }
    return Promise.resolve(null);
  });
  (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
}

/** Contract generation in Case A / Case B */
function mockContractGen() {
  (prisma.contractGeneration.findUnique as jest.Mock).mockImplementation((args: any) => {
    if (args.where.id === CONTRACT_GEN_1 || args.where.id === 'gen-1') {
      return Promise.resolve({
        id: CONTRACT_GEN_1,
        caseId: CASE_A,
        title: 'Contract A',
        fileName: 'contract.pdf',
        filePath: '/tmp/test-contract.pdf',
        revisionNumber: 1,
        status: 'GENERATED',
        parentRevisionId: null,
      });
    }
    if (args.where.id === 'gen-case-b' || args.where.id === 'gen-client-b') {
      return Promise.resolve({
        id: 'gen-case-b',
        caseId: CASE_B,
        title: 'Contract B',
        fileName: 'contract-b.pdf',
        filePath: '/tmp/test-contract-b.pdf',
        revisionNumber: 1,
        status: 'GENERATED',
        parentRevisionId: null,
      });
    }
    return Promise.resolve(null);
  });
}

/** Version belonging to STANDARD_DOC */
function mockVersion() {
  (prisma.documentVersion.findUnique as jest.Mock).mockImplementation((args: any) => {
    if (args.where.id === VERSION_1) {
      return Promise.resolve({
        id: VERSION_1,
        documentId: STANDARD_DOC,
        document: { caseId: CASE_A },
      });
    }
    return Promise.resolve(null);
  });
  (prisma.documentVersion.findFirst as jest.Mock).mockImplementation((args: any) => {
    const id = args.where?.id;
    const documentId = args.where?.documentId;
    if (id === VERSION_1 && documentId === STANDARD_DOC) {
      return Promise.resolve({
        id: VERSION_1,
        documentId: STANDARD_DOC,
        document: { caseId: CASE_A, securityClassification: 'STANDARD' },
      });
    }
    if (id === VERSION_B && documentId === CASE_B_DOC) {
      return Promise.resolve({
        id: VERSION_B,
        documentId: CASE_B_DOC,
        document: { caseId: CASE_B, securityClassification: 'STANDARD' },
      });
    }
    if (id === 'version-hr' && documentId === HR_DOC) {
      return Promise.resolve({
        id: 'version-hr',
        documentId: HR_DOC,
        document: { caseId: CASE_A, securityClassification: 'HR_CONFIDENTIAL' },
      });
    }
    return Promise.resolve(null);
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
let app: Express;

beforeEach(() => {
  jest.clearAllMocks();
  app = buildApp();
  mockCaseA();
  mockStandardDoc();
  mockHrDoc();
  mockContractGen();
  mockVersion();
  (prisma.documentReviewSuggestion.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.documentReviewSuggestion.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.documentReviewSuggestion.create as jest.Mock).mockResolvedValue({ id: 'suggestion-1' });
  (prisma.documentAnnotation.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.documentAnnotation.count as jest.Mock).mockResolvedValue(0);
});

// ===========================================================================
// TEST SUITES
// ===========================================================================

describe('SEC-1: Document object authorization', () => {
  // ----- GET /:id (document metadata) -----
  describe('GET /documents/:id — document metadata', () => {
    it('allows same-case lawyer to read document', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(200);
    });

    it('denies cross-case lawyer (LAWYER_B cannot read Case A doc)', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('denies unrelated workforce (no case relationship)', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}`, {
        'x-test-user-id': UNRELATED_LAWYER,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent document UUID (no existence leak)', async () => {
      const res = await requestJson(app, 'GET', '/api/v1/documents/nonexistent-uuid', {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(404);
    });
  });

  // ----- HR_CONFIDENTIAL boundary -----
  describe('HR_CONFIDENTIAL boundary', () => {
    it('allows ADMIN to read HR_CONFIDENTIAL document', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${HR_DOC}`, {
        'x-test-user-id': ADMIN_USER,
        'x-test-role': 'ADMIN',
      });
      expect(res.status).toBe(200);
    });

    it('allows PARTNER to read HR_CONFIDENTIAL document', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${HR_DOC}`, {
        'x-test-user-id': 'partner-user',
        'x-test-role': 'PARTNER',
      });
      expect(res.status).toBe(200);
    });

    it('denies assigned LAWYER from reading HR_CONFIDENTIAL document', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${HR_DOC}`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('denies COLLAB_LAWYER from reading HR_CONFIDENTIAL document', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${HR_DOC}`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'COLLAB_LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  // ----- GET /:id/text (document text — downloads from SharePoint) -----
  describe('GET /documents/:id/text — document text (download)', () => {
    it('allows same-case lawyer (auth passes; SharePoint handler returns 500 in test)', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/text`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      // Authorization passes (not 403/401); handler fails due to unresolvable dynamic import
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('denies cross-case lawyer', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/text`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('denies HR_CONFIDENTIAL for non-privileged', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${HR_DOC}/text`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  // ----- GET /:id/download (SharePoint download) -----
  describe('GET /documents/:id/download — file download', () => {
    it('allows same-case lawyer (auth passes; SharePoint handler returns 500 in test)', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/download`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      // Authorization passes (not 403/401); handler fails due to unresolvable dynamic import
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('denies cross-case lawyer before SharePoint access', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/download`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('denies unrelated workforce', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/download`, {
        'x-test-user-id': UNRELATED_LAWYER,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  // ----- POST /:id/version (upload new version) -----
  describe('POST /documents/:id/version — upload version', () => {
    it('allows same-case lawyer to upload version', async () => {
      const res = await requestJson(app, 'POST', `/api/v1/documents/${STANDARD_DOC}/version`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      // 400 because we don't send fileContent body — but auth passes
      expect(res.status).toBe(400);
    });

    it('denies cross-case lawyer before any file processing', async () => {
      const res = await requestJson(app, 'POST', `/api/v1/documents/${STANDARD_DOC}/version`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  // ----- POST /:id/approve, /:id/reject, /:id/submit-review -----
  describe('Document workflow actions — manage access required', () => {
    it('denies cross-case lawyer from approving', async () => {
      const res = await requestJson(app, 'POST', `/api/v1/documents/${STANDARD_DOC}/approve`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('denies cross-case lawyer from rejecting', async () => {
      const res = await requestJson(app, 'POST', `/api/v1/documents/${STANDARD_DOC}/reject`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('denies cross-case lawyer from submitting for review', async () => {
      const res = await requestJson(app, 'POST', `/api/v1/documents/${STANDARD_DOC}/submit-review`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  // ----- GET /case/:caseId (case document listing) -----
  describe('GET /documents/case/:caseId — case document listing', () => {
    it('allows same-case lawyer', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/case/${CASE_A}`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(200);
    });

    it('denies cross-case lawyer', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/case/${CASE_A}`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  // ----- GET /:id/comments -----
  describe('GET /documents/:id/comments — document comments', () => {
    it('allows same-case lawyer', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/comments`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(200);
    });

    it('denies cross-case lawyer', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/comments`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  // ----- Version UUID attack -----
  describe('Version UUID attack', () => {
    it('denies access to version belonging to another case', async () => {
      // Version belongs to Case A (via STANDARD_DOC)
      // LAWYER_B is assigned to Case B
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/versions/${VERSION_1}`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent version UUID', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/versions/nonexistent-uuid`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(404);
    });
  });

  // ----- Portal denied -----
  describe('Portal user access', () => {
    it('denies portal/CLIENT role access to document', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}`, {
        'x-test-user-id': 'portal-user',
        'x-test-role': 'CLIENT',
      });
      expect(res.status).toBe(403);
    });
  });
});

describe('SEC-1: Contract object authorization', () => {
  describe('GET /contracts/:id/download — contract download', () => {
    it('allows same-case lawyer to download contract (auth passes)', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/download`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      // Authorization passes (not 403); handler may 404 due to mock fs in test env
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    it('denies cross-case lawyer from downloading contract', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/download`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('denies unrelated workforce from downloading contract', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/download`, {
        'x-test-user-id': UNRELATED_LAWYER,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('returns 404 for non-existent contract UUID', async () => {
      const res = await requestJson(app, 'GET', '/api/v1/contracts/nonexistent-uuid/download', {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /contracts/:id/upload-sharepoint — SharePoint upload', () => {
    it('denies cross-case lawyer from uploading to SharePoint', async () => {
      const res = await requestJson(app, 'POST', `/api/v1/contracts/${CONTRACT_GEN_1}/upload-sharepoint`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /contracts/:id/finalize — contract finalization', () => {
    it('denies cross-case lawyer from finalizing', async () => {
      const res = await requestJson(app, 'POST', `/api/v1/contracts/${CONTRACT_GEN_1}/finalize`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /contracts/:id/create-revision — revision creation', () => {
    it('denies cross-case lawyer from creating revision', async () => {
      const res = await requestJson(app, 'POST', `/api/v1/contracts/${CONTRACT_GEN_1}/create-revision`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /contracts/case/:caseId — case contracts listing', () => {
    it('allows same-case lawyer', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/contracts/case/${CASE_A}`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(200);
    });

    it('denies cross-case lawyer', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/contracts/case/${CASE_A}`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /contracts/case/:caseId/bundle-download — bundle download', () => {
    it('denies cross-case lawyer from bundle download', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/contracts/case/${CASE_A}/bundle-download`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /contracts/templates — template upload (admin only)', () => {
    it('denies LAWYER from uploading template', async () => {
      const res = await requestJson(app, 'POST', '/api/v1/contracts/templates', {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });

    it('allows ADMIN to upload template', async () => {
      const res = await requestJson(app, 'POST', '/api/v1/contracts/templates', {
        'x-test-user-id': ADMIN_USER,
        'x-test-role': 'ADMIN',
      });
      // 400 because no file — but auth passes
      expect(res.status).toBe(400);
    });
  });

  describe('POST /contracts/cleanup — admin only', () => {
    it('denies LAWYER from cleanup', async () => {
      const res = await requestJson(app, 'POST', '/api/v1/contracts/cleanup', {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('Contract timeline', () => {
    it('denies cross-case lawyer from viewing timeline', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/timeline`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });
});

describe('SEC-1: Generation draft authorization', () => {
  describe('GET /generation-drafts/:caseId', () => {
    it('allows same-case lawyer', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/generation-drafts/${CASE_A}`, {
        'x-test-user-id': LAWYER_A,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(200);
    });

    it('denies cross-case lawyer', async () => {
      const res = await requestJson(app, 'GET', `/api/v1/generation-drafts/${CASE_A}`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /generation-drafts/:caseId', () => {
    it('denies cross-case lawyer from saving draft', async () => {
      const res = await requestJson(app, 'PUT', `/api/v1/generation-drafts/${CASE_A}`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /generation-drafts/:caseId', () => {
    it('denies cross-case lawyer from deleting draft', async () => {
      const res = await requestJson(app, 'DELETE', `/api/v1/generation-drafts/${CASE_A}`, {
        'x-test-user-id': LAWYER_B,
        'x-test-role': 'LAWYER',
      });
      expect(res.status).toBe(403);
    });
  });
});

describe('SEC-1: Cross-client isolation', () => {
  it('LAWYER_A (Client A) cannot access Client B document', async () => {
    // Document in Case B (Client B)
    (prisma.document.findUnique as jest.Mock).mockImplementation((args: any) => {
      if (args.where.id === 'doc-client-b') {
        return Promise.resolve({
          id: 'doc-client-b',
          caseId: CASE_B,
          clientId: CLIENT_B,
          securityClassification: 'STANDARD',
          name: 'Client B Doc',
        });
      }
      return Promise.resolve(null);
    });

    const res = await requestJson(app, 'GET', '/api/v1/documents/doc-client-b', {
      'x-test-user-id': LAWYER_A,
      'x-test-role': 'LAWYER',
    });
    expect(res.status).toBe(403);
  });

  it('LAWYER_A (Client A) cannot access Client B contract', async () => {
    (prisma.contractGeneration.findUnique as jest.Mock).mockImplementation((args: any) => {
      if (args.where.id === 'gen-client-b') {
        return Promise.resolve({
          id: 'gen-client-b',
          caseId: CASE_B,
        });
      }
      return Promise.resolve(null);
    });

    const res = await requestJson(app, 'GET', '/api/v1/contracts/gen-client-b/download', {
      'x-test-user-id': LAWYER_A,
      'x-test-role': 'LAWYER',
    });
    expect(res.status).toBe(403);
  });

  it('LAWYER_A (Client A) cannot access Client B generation drafts', async () => {
    const res = await requestJson(app, 'GET', `/api/v1/generation-drafts/${CASE_B}`, {
      'x-test-user-id': LAWYER_A,
      'x-test-role': 'LAWYER',
    });
    expect(res.status).toBe(403);
  });
});

describe('SEC-1: Privileged access', () => {
  it('ADMIN can read any document', async () => {
    const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}`, {
      'x-test-user-id': ADMIN_USER,
      'x-test-role': 'ADMIN',
    });
    expect(res.status).toBe(200);
  });

  it('PARTNER can read any document', async () => {
    const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}`, {
      'x-test-user-id': 'partner-user',
      'x-test-role': 'PARTNER',
    });
    expect(res.status).toBe(200);
  });

  it('ADMIN can manage any document', async () => {
    const res = await requestJson(app, 'POST', `/api/v1/documents/${STANDARD_DOC}/approve`, {
      'x-test-user-id': ADMIN_USER,
      'x-test-role': 'ADMIN',
    });
    expect(res.status).toBe(200);
  });

  it('ADMIN can download any contract (auth passes)', async () => {
    const res = await requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/download`, {
      'x-test-user-id': ADMIN_USER,
      'x-test-role': 'ADMIN',
    });
    // Authorization passes (not 403/401); handler may 404 due to mock fs in test env
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});

describe('SEC-1: P0/P1 adversarial authorization regressions', () => {
  const lawyerAHeaders = { 'x-test-user-id': LAWYER_A, 'x-test-role': 'LAWYER' };

  it('denies Case A lawyer from listing or creating Case B review suggestions', async () => {
    const list = await requestJson(app, 'GET', `/api/v1/documents/${CASE_B_DOC}/review-suggestions`, lawyerAHeaders);
    const create = await requestJson(app, 'POST', `/api/v1/documents/${CASE_B_DOC}/review-suggestions`, lawyerAHeaders, {
      workspaceSource: 'CONTRACT_WORKSPACE', type: 'COMMENT', selectedTextPreview: 'private text',
    });
    expect(list.status).toBe(403);
    expect(create.status).toBe(403);
  });

  it('fails closed when a suggestion or supplied version belongs to another document', async () => {
    const patch = await requestJson(app, 'PATCH', `/api/v1/documents/${STANDARD_DOC}/review-suggestions/suggestion-case-b`, lawyerAHeaders, { status: 'ACCEPTED' });
    const create = await requestJson(app, 'POST', `/api/v1/documents/${STANDARD_DOC}/review-suggestions`, lawyerAHeaders, {
      workspaceSource: 'CONTRACT_WORKSPACE', type: 'COMMENT', selectedTextPreview: 'private text', documentVersionId: VERSION_B,
    });
    expect(patch.status).toBe(404);
    expect(create.status).toBe(404);
  });

  it('adds the Case visibility predicate to the document search database query', async () => {
    const documentsService = jest.requireActual('../src/modules/documents/services').default;
    (prisma.document.findMany as jest.Mock).mockResolvedValue([]);
    const scope = { OR: [{ assignedLawyerId: LAWYER_A }, { createdById: LAWYER_A }, { collaborators: { some: { userId: LAWYER_A } } }] };
    await documentsService.searchDocuments('contract', 50, 'LAWYER', scope);
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ case: scope, securityClassification: { not: 'HR_CONFIDENTIAL' } }),
    }));
  });

  it('applies the authorized Case-only search scope on the route', async () => {
    const documentsService = require('../src/modules/documents/services').default;
    await requestJson(app, 'GET', '/api/v1/documents/search?q=contract', lawyerAHeaders);
    expect(documentsService.searchDocuments).toHaveBeenCalledWith(
      'contract',
      50,
      'LAWYER',
      expect.objectContaining({ OR: expect.any(Array) }),
    );
  });

  it('allows authorized annotation access for standard documents but denies HR documents to lawyers', async () => {
    const standard = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/versions/${VERSION_1}/annotations`, lawyerAHeaders);
    const hr = await requestJson(app, 'GET', `/api/v1/documents/${HR_DOC}/versions/version-hr/annotations`, lawyerAHeaders);
    expect(standard.status).toBe(200);
    expect(hr.status).toBe(403);
  });

  it('allows HR annotation access only to privileged workforce with Case access', async () => {
    const admin = await requestJson(app, 'GET', `/api/v1/documents/${HR_DOC}/versions/version-hr/annotations`, {
      'x-test-user-id': ADMIN_USER,
      'x-test-role': 'ADMIN',
    });
    expect(admin.status).toBe(200);
  });

  it('fails closed when a version UUID is substituted across documents', async () => {
    const res = await requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/versions/${VERSION_B}`, lawyerAHeaders);
    expect(res.status).toBe(404);
  });

  it('retains service-level comment parent binding', async () => {
    const comments = jest.requireActual('../src/modules/documents/documentComments.service');
    (prisma.comment.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(comments.resolveDocumentComment(
      { user: { userId: LAWYER_A, role: 'LAWYER' } } as Request,
      STANDARD_DOC,
      'comment-case-b',
    )).rejects.toMatchObject({ code: 'COMMENT_NOT_FOUND', statusCode: 404 });
  });

  it('denies local CLIENT users across internal document, nested document, and contract routes', async () => {
    const clientHeaders = { 'x-test-user-id': LAWYER_A, 'x-test-role': 'CLIENT' };
    const [document, suggestions, annotations, templates] = await Promise.all([
      requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}`, clientHeaders),
      requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/review-suggestions`, clientHeaders),
      requestJson(app, 'GET', `/api/v1/documents/${STANDARD_DOC}/versions/${VERSION_1}/annotations`, clientHeaders),
      requestJson(app, 'GET', '/api/v1/contracts/templates', clientHeaders),
    ]);
    expect([document.status, suggestions.status, annotations.status, templates.status]).toEqual([403, 403, 403, 403]);
  });
});

describe('SEC-1: Nested contract review notes authorization', () => {
  it('1. unauthenticated review-notes GET denied', async () => {
    const res = await requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/review-notes`, { authorization: '' });
    expect(res.status).toBe(401);
  });

  it('2. unauthenticated review-notes PUT denied', async () => {
    const res = await requestJson(app, 'PUT', `/api/v1/contracts/${CONTRACT_GEN_1}/review-notes`, { authorization: '' }, { overallStatus: 'NEEDS_REVISION' });
    expect(res.status).toBe(401);
  });

  it('3. unauthenticated review-summary denied', async () => {
    const res = await requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/review-summary.txt`, { authorization: '' });
    expect(res.status).toBe(401);
  });

  it('4. local CLIENT denied all three review-note routes', async () => {
    const clientHeaders = { 'x-test-user-id': LAWYER_A, 'x-test-role': 'CLIENT' };
    const [getNotes, putNotes, getSummary] = await Promise.all([
      requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/review-notes`, clientHeaders),
      requestJson(app, 'PUT', `/api/v1/contracts/${CONTRACT_GEN_1}/review-notes`, clientHeaders, { overallStatus: 'NEEDS_REVISION' }),
      requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/review-summary.txt`, clientHeaders),
    ]);
    expect(getNotes.status).toBe(403);
    expect((getNotes.body as any).code).toBe('WORKFORCE_ACCESS_REQUIRED');
    expect(putNotes.status).toBe(403);
    expect((putNotes.body as any).code).toBe('WORKFORCE_ACCESS_REQUIRED');
    expect(getSummary.status).toBe(403);
    expect((getSummary.body as any).code).toBe('WORKFORCE_ACCESS_REQUIRED');
  });

  it('5. Case A lawyer cannot GET Case B review notes', async () => {
    const res = await requestJson(app, 'GET', '/api/v1/contracts/gen-case-b/review-notes', {
      'x-test-user-id': LAWYER_A,
      'x-test-role': 'LAWYER',
    });
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe('CONTRACT_ACCESS_FORBIDDEN');
  });

  it('6. Case A lawyer cannot PUT Case B review notes', async () => {
    const res = await requestJson(app, 'PUT', '/api/v1/contracts/gen-case-b/review-notes', {
      'x-test-user-id': LAWYER_A,
      'x-test-role': 'LAWYER',
    }, { overallStatus: 'NEEDS_REVISION' });
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe('CONTRACT_ACCESS_FORBIDDEN');
  });

  it('7. Case A lawyer cannot export Case B review summary', async () => {
    const res = await requestJson(app, 'GET', '/api/v1/contracts/gen-case-b/review-summary.txt', {
      'x-test-user-id': LAWYER_A,
      'x-test-role': 'LAWYER',
    });
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe('CONTRACT_ACCESS_FORBIDDEN');
  });

  it('8. PUT authorId body spoof does not control actor identity', async () => {
    const reviewNotesService = require('../src/modules/review-notes/service').default;
    const res = await requestJson(app, 'PUT', `/api/v1/contracts/${CONTRACT_GEN_1}/review-notes`, {
      'x-test-user-id': LAWYER_A,
      'x-test-role': 'LAWYER',
    }, {
      overallStatus: 'NEEDS_REVISION',
      authorId: 'spoofed-attacker-identity',
      overallTitle: 'Review Title',
    });
    expect(res.status).toBe(200);
    expect(reviewNotesService.upsertReviewNotes).toHaveBeenCalledWith(
      CONTRACT_GEN_1,
      expect.objectContaining({
        authorId: LAWYER_A,
        overallStatus: 'NEEDS_REVISION',
      })
    );
  });
});

describe('SEC-1: Clause library workforce and case authorization', () => {
  const lawyerAHeaders = { 'x-test-user-id': LAWYER_A, 'x-test-role': 'LAWYER' };
  const clientHeaders = { 'x-test-user-id': 'client-user', 'x-test-role': 'CLIENT' };

  it('9. local CLIENT denied Clause Library', async () => {
    const [status, clauses, assembly] = await Promise.all([
      requestJson(app, 'GET', '/api/v1/clause-library/', clientHeaders),
      requestJson(app, 'GET', '/api/v1/clause-library/clauses', clientHeaders),
      requestJson(app, 'GET', `/api/v1/clause-library/assembly/${CASE_A}`, clientHeaders),
    ]);
    expect(status.status).toBe(403);
    expect((status.body as any).code).toBe('WORKFORCE_ACCESS_REQUIRED');
    expect(clauses.status).toBe(403);
    expect((clauses.body as any).code).toBe('WORKFORCE_ACCESS_REQUIRED');
    expect(assembly.status).toBe(403);
    expect((assembly.body as any).code).toBe('WORKFORCE_ACCESS_REQUIRED');
  });

  it('10. Case A user cannot GET Case B assembly', async () => {
    const res = await requestJson(app, 'GET', `/api/v1/clause-library/assembly/${CASE_B}`, lawyerAHeaders);
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe('CASE_ACCESS_FORBIDDEN');
  });

  it('11. cannot PUT Case B assembly', async () => {
    const res = await requestJson(app, 'PUT', `/api/v1/clause-library/assembly/${CASE_B}`, lawyerAHeaders, {
      intakeData: { purpose: 'unauthorized' },
    });
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe('CASE_ACCESS_FORBIDDEN');
  });

  it('12. cannot PATCH Case B assembly status', async () => {
    const res = await requestJson(app, 'PATCH', `/api/v1/clause-library/assembly/${CASE_B}/status`, lawyerAHeaders, {
      status: 'APPROVED',
    });
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe('CASE_ACCESS_FORBIDDEN');
  });

  it('13. cannot DELETE Case B assembly', async () => {
    const res = await requestJson(app, 'DELETE', `/api/v1/clause-library/assembly/${CASE_B}`, lawyerAHeaders);
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe('CASE_ACCESS_FORBIDDEN');
  });

  it('14. review-guidance inaccessible document denied', async () => {
    const res = await requestJson(app, 'POST', '/api/v1/clause-library/review-guidance', lawyerAHeaders, {
      documentId: CASE_B_DOC,
    });
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe('DOCUMENT_ACCESS_FORBIDDEN');
  });

  it('15. HR_CONFIDENTIAL review-guidance denied to ordinary lawyer even with ordinary Case access', async () => {
    const res = await requestJson(app, 'POST', '/api/v1/clause-library/review-guidance', lawyerAHeaders, {
      documentId: HR_DOC,
    });
    expect(res.status).toBe(403);
    expect((res.body as any).code).toBe('DOCUMENT_ACCESS_FORBIDDEN');
  });

  it('16. authorized workforce happy paths remain working', async () => {
    const [reviewNotes, reviewSummary, assemblyGet, assemblyPut, guidanceStandard, guidanceAdminHr] = await Promise.all([
      requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/review-notes`, lawyerAHeaders),
      requestJson(app, 'GET', `/api/v1/contracts/${CONTRACT_GEN_1}/review-summary.txt`, lawyerAHeaders),
      requestJson(app, 'GET', `/api/v1/clause-library/assembly/${CASE_A}`, lawyerAHeaders),
      requestJson(app, 'PUT', `/api/v1/clause-library/assembly/${CASE_A}`, lawyerAHeaders, { intakeData: { ok: true } }),
      requestJson(app, 'POST', '/api/v1/clause-library/review-guidance', lawyerAHeaders, { documentId: STANDARD_DOC }),
      requestJson(app, 'POST', '/api/v1/clause-library/review-guidance', {
        'x-test-user-id': ADMIN_USER,
        'x-test-role': 'ADMIN',
      }, { documentId: HR_DOC }),
    ]);
    expect(reviewNotes.status).toBe(200);
    expect(reviewSummary.status).toBe(200);
    expect(assemblyGet.status).toBe(200);
    expect(assemblyPut.status).toBe(200);
    expect(guidanceStandard.status).toBe(200);
    expect(guidanceAdminHr.status).toBe(200);
  });
});
