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

// Mock multer — manual mock at __mocks__/multer.js handles this

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
import generationDraftRoutes from '../src/modules/generation-draft/routes';
import { prisma } from '../src/prisma/prisma.service';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
type TestResponse = { status: number; body: unknown };

function requestJson(
  app: Express,
  method: string,
  path: string,
  headers: Record<string, string> = {}
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
      request.end();
    });
  });
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/documents', documentsRoutes);
  app.use('/api/v1/contracts', contractsRoutes);
  app.use('/api/v1/generation-drafts', generationDraftRoutes);
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
const VERSION_1 = 'version-1';
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

/** Contract generation in Case A */
function mockContractGen() {
  (prisma.contractGeneration.findUnique as jest.Mock).mockImplementation((args: any) => {
    if (args.where.id === CONTRACT_GEN_1) {
      return Promise.resolve({
        id: CONTRACT_GEN_1,
        caseId: CASE_A,
        filePath: '/tmp/test-contract.pdf',
        fileName: 'contract.pdf',
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
