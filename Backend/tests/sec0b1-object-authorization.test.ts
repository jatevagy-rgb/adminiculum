/**
 * SEC-0B1: Anonymization + Legal Analysis Object-Level Authorization Tests
 */

import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

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

jest.mock('../src/middleware/featureAvailability', () => ({
  isDatabaseFoundationEnabled: () => true,
  requireDatabaseFoundation: () => (req: Request, res: Response, next: NextFunction) => next(),
}));

const mockPrisma = {
  case: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  caseCollaborator: {
    findFirst: jest.fn(),
  },
  document: {
    findUnique: jest.fn(),
  },
  contractGeneration: {
    findUnique: jest.fn(),
  },
  anonymousDocument: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  legalAnalysis: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  timelineEvent: {
    create: jest.fn(),
  },
};

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: mockPrisma,
}));

const mockAnonymizeService = {
  anonymizeDocument: jest.fn(),
  getAnonymizationSourceText: jest.fn(),
  getClientRedactionProfile: jest.fn(),
  upsertRedactionProfile: jest.fn(),
  getAnonymousDocument: jest.fn(),
  listAnonymousDocumentsByCase: jest.fn(),
  listAnonymousDocumentsBySource: jest.fn(),
  importAIResponse: jest.fn(),
  saveRehydratedResultToDocument: jest.fn(),
};

jest.mock('../src/modules/anonymize/services', () => ({
  __esModule: true,
  default: mockAnonymizeService,
}));

const mockLegalAnalysesService = {
  listLegalAnalyses: jest.fn(),
  createLegalAnalysis: jest.fn(),
  getLegalAnalysis: jest.fn(),
  updateLegalAnalysis: jest.fn(),
  deleteLegalAnalysis: jest.fn(),
};

jest.mock('../src/modules/legal-analyses/service', () => ({
  __esModule: true,
  default: mockLegalAnalysesService,
  LegalAnalysisServiceError: class extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import anonymizeService from '../src/modules/anonymize/services';
import legalAnalysesService from '../src/modules/legal-analyses/service';
import anonymizeRoutes from '../src/modules/anonymize/routes';
import legalAnalysesRoutes from '../src/modules/legal-analyses/routes';

type TestResponse = { status: number; body: unknown };

function requestJson(
  app: Express,
  method: string,
  path: string,
  authenticated = true,
  extraHeaders: Record<string, string> = {}
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: {
            ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
            'content-type': 'application/json',
            ...extraHeaders,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
          });
        }
      );
      request.on('error', (error) => { server.close(); reject(error); });
      request.end();
    });
  });
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', anonymizeRoutes);
  app.use('/api/v1', legalAnalysesRoutes);
  return app;
}

const CLIENT_A_CASE_ID = 'case-client-a-001';
const CLIENT_B_CASE_ID = 'case-client-b-002';
const CLIENT_A_ANON_DOC_ID = 'anon-doc-client-a-001';
const CLIENT_B_ANON_DOC_ID = 'anon-doc-client-b-002';
const CLIENT_A_LEGAL_ANALYSIS_ID = 'legal-analysis-client-a-001';
const CLIENT_B_LEGAL_ANALYSIS_ID = 'legal-analysis-client-b-002';
const LAWYER_USER_ID = 'lawyer-user-001';
const ADMIN_USER_ID = 'admin-user-001';

const mockCaseRecordA = {
  id: CLIENT_A_CASE_ID,
  assignedLawyerId: LAWYER_USER_ID,
  createdById: 'other-user',
};

const mockCaseRecordB = {
  id: CLIENT_B_CASE_ID,
  assignedLawyerId: 'other-lawyer',
  createdById: 'other-user',
};

const mockAnonymousDocumentA = {
  id: CLIENT_A_ANON_DOC_ID,
  name: '[ANONYMIZED] Test Document A',
  caseId: CLIENT_A_CASE_ID,
  sourceDocId: 'doc-client-a-001',
  aiTask: 'REVIEW_RISKS',
  rehydrationStatus: 'COMPLETE',
  rehydratedAt: new Date('2026-08-01'),
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-01'),
  patternCount: 5,
  content: 'Redacted content for document A',
  redactedItems: [{ token: '[UGYFEL_1]', original: 'Test Client A' }],
  customPrompt: 'Review for risks',
  rehydratedContent: 'Rehydrated content for A',
  aiResponseText: 'AI response for A',
  rehydrationWarnings: [],
  originalDocId: 'doc-client-a-001',
};

const mockAnonymousDocumentB = {
  id: CLIENT_B_ANON_DOC_ID,
  name: '[ANONYMIZED] Test Document B',
  caseId: CLIENT_B_CASE_ID,
  sourceDocId: 'doc-client-b-002',
  aiTask: 'SUMMARIZE',
  rehydrationStatus: 'PENDING',
  rehydratedAt: null,
  createdAt: new Date('2026-08-02'),
  updatedAt: new Date('2026-08-02'),
  patternCount: 3,
  content: 'Redacted content for document B',
  redactedItems: [{ token: '[UGYFEL_1]', original: 'Test Client B' }],
  customPrompt: 'Summarize',
  rehydratedContent: null,
  aiResponseText: null,
  rehydrationWarnings: null,
  originalDocId: 'doc-client-b-002',
};

const mockLegalAnalysisA = {
  id: CLIENT_A_LEGAL_ANALYSIS_ID,
  caseId: CLIENT_A_CASE_ID,
  documentId: 'doc-client-a-001',
  documentSourceType: 'DOCUMENT',
  title: 'Legal Analysis A',
  analysisText: 'Analysis text for A',
  status: 'DRAFT',
  sourceType: 'PASTED_AI_OUTPUT',
  aiToolName: 'GPT-4',
  anonymizedInputSnapshot: 'Sensitive snapshot A',
  riskMatrixDetected: false,
  missingDataDetected: false,
  suggestedChangesDetected: false,
  lawyerDecisionPointsDetected: false,
  createdById: LAWYER_USER_ID,
  reviewedById: null,
  reviewedAt: null,
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-01'),
};

const mockLegalAnalysisB = {
  id: CLIENT_B_LEGAL_ANALYSIS_ID,
  caseId: CLIENT_B_CASE_ID,
  documentId: 'doc-client-b-002',
  documentSourceType: 'DOCUMENT',
  title: 'Legal Analysis B',
  analysisText: 'Analysis text for B',
  status: 'APPROVED',
  sourceType: 'MANUAL',
  aiToolName: null,
  anonymizedInputSnapshot: 'Sensitive snapshot B',
  riskMatrixDetected: true,
  missingDataDetected: false,
  suggestedChangesDetected: true,
  lawyerDecisionPointsDetected: false,
  createdById: 'other-lawyer',
  reviewedById: ADMIN_USER_ID,
  reviewedAt: new Date('2026-08-02'),
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-02'),
};

function setupCaseMock(caseRecord: typeof mockCaseRecordA) {
  (prisma.case.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
    if (where.id === CLIENT_A_CASE_ID) return mockCaseRecordA;
    if (where.id === CLIENT_B_CASE_ID) return mockCaseRecordB;
    return null;
  });
}

describe('SEC-0B1: Cross-client isolation', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.ENABLE_AI_ANONYMIZATION = 'true';
    process.env.ENABLE_LEGAL_ANALYSES = 'true';

    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    (mockAnonymizeService.getAnonymousDocument as jest.Mock).mockResolvedValue(null);
    (mockAnonymizeService.listAnonymousDocumentsByCase as jest.Mock).mockResolvedValue([]);
    (mockAnonymizeService.listAnonymousDocumentsBySource as jest.Mock).mockResolvedValue([]);
    (mockLegalAnalysesService.listLegalAnalyses as jest.Mock).mockResolvedValue([]);
    (mockLegalAnalysesService.getLegalAnalysis as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.ENABLE_AI_ANONYMIZATION;
    delete process.env.ENABLE_LEGAL_ANALYSES;
  });

  describe('Anonymized documents — cross-client isolation', () => {
    it('returns 403 when LAWYER tries to access CLIENT_B anonymous doc', async () => {
      setupCaseMock(mockCaseRecordB);
      (prisma.anonymousDocument.findUnique as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentB);
      (mockAnonymizeService.getAnonymousDocument as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentB);

      const response = await requestJson(
        createApp(), 'GET',
        `/api/v1/anonymous-documents/${CLIENT_B_ANON_DOC_ID}`,
        true,
        { 'x-test-user-id': LAWYER_USER_ID, 'x-test-role': 'LAWYER' }
      );

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        status: 403,
        code: 'CASE_ACCESS_FORBIDDEN',
      });
    });

    it('allows LAWYER to access their own CLIENT_A anonymous doc', async () => {
      setupCaseMock(mockCaseRecordA);
      (prisma.anonymousDocument.findUnique as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);
      (mockAnonymizeService.getAnonymousDocument as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);
      (prisma.case.findUnique as jest.Mock)
        .mockImplementationOnce(async ({ where }: any) => {
          if (where.id === CLIENT_A_CASE_ID) return mockCaseRecordA;
          return null;
        })
        .mockResolvedValueOnce(mockCaseRecordA);

      const response = await requestJson(
        createApp(), 'GET',
        `/api/v1/anonymous-documents/${CLIENT_A_ANON_DOC_ID}`,
        true,
        { 'x-test-user-id': LAWYER_USER_ID, 'x-test-role': 'LAWYER' }
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: CLIENT_A_ANON_DOC_ID,
        redactedText: 'Redacted content for document A',
      });
    });

    it('returns 403 when LAWYER tries to list anonymous docs for CLIENT_B case', async () => {
      setupCaseMock(mockCaseRecordB);

      const response = await requestJson(
        createApp(), 'GET',
        `/api/v1/anonymous-documents?caseId=${CLIENT_B_CASE_ID}`,
        true,
        { 'x-test-user-id': LAWYER_USER_ID, 'x-test-role': 'LAWYER' }
      );

      expect(response.status).toBe(403);
    });

    it('allows LAWYER to list anonymous docs for their own CLIENT_A case', async () => {
      setupCaseMock(mockCaseRecordA);
      (mockAnonymizeService.listAnonymousDocumentsByCase as jest.Mock).mockResolvedValueOnce([mockAnonymousDocumentA]);

      const response = await requestJson(
        createApp(), 'GET',
        `/api/v1/anonymous-documents?caseId=${CLIENT_A_CASE_ID}`,
        true,
        { 'x-test-user-id': LAWYER_USER_ID, 'x-test-role': 'LAWYER' }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Legal analyses — cross-client isolation', () => {
    it('returns 403 when LAWYER tries to get CLIENT_B legal analysis', async () => {
      (prisma.legalAnalysis.findUnique as jest.Mock).mockResolvedValueOnce(mockLegalAnalysisB);
      setupCaseMock(mockCaseRecordB);

      const response = await requestJson(
        createApp(), 'GET',
        `/api/v1/legal-analyses/${CLIENT_B_LEGAL_ANALYSIS_ID}`,
        true,
        { 'x-test-user-id': LAWYER_USER_ID, 'x-test-role': 'LAWYER' }
      );

      expect(response.status).toBe(403);
    });

    it('allows LAWYER to get their own CLIENT_A legal analysis', async () => {
      (prisma.legalAnalysis.findUnique as jest.Mock).mockResolvedValueOnce(mockLegalAnalysisA);
      setupCaseMock(mockCaseRecordA);
      (mockLegalAnalysesService.getLegalAnalysis as jest.Mock).mockResolvedValueOnce(mockLegalAnalysisA);

      const response = await requestJson(
        createApp(), 'GET',
        `/api/v1/legal-analyses/${CLIENT_A_LEGAL_ANALYSIS_ID}`,
        true,
        { 'x-test-user-id': LAWYER_USER_ID, 'x-test-role': 'LAWYER' }
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: CLIENT_A_LEGAL_ANALYSIS_ID,
        analysisText: 'Analysis text for A',
      });
    });
  });
});

describe('SEC-0B1: Portal deny tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_AI_ANONYMIZATION = 'true';
    process.env.ENABLE_LEGAL_ANALYSES = 'true';

    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
    (mockAnonymizeService.getAnonymousDocument as jest.Mock).mockResolvedValue(null);
    (mockLegalAnalysesService.getLegalAnalysis as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.ENABLE_AI_ANONYMIZATION;
    delete process.env.ENABLE_LEGAL_ANALYSES;
  });

  it('denies portal user access to anonymous document', async () => {
    setupCaseMock(mockCaseRecordA);
    (prisma.anonymousDocument.findUnique as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/anonymous-documents/${CLIENT_A_ANON_DOC_ID}`,
      true,
      { 'x-test-user-id': 'portal-user-001', 'x-test-role': 'CLIENT' }
    );

    expect(response.status).toBe(403);
  });

  it('denies portal user access to list anonymous docs', async () => {
    setupCaseMock(mockCaseRecordA);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/anonymous-documents?caseId=${CLIENT_A_CASE_ID}`,
      true,
      { 'x-test-user-id': 'portal-user-001', 'x-test-role': 'CLIENT' }
    );

    expect(response.status).toBe(403);
  });

  it('denies portal user access to legal analysis', async () => {
    (prisma.legalAnalysis.findUnique as jest.Mock).mockResolvedValueOnce(mockLegalAnalysisA);
    setupCaseMock(mockCaseRecordA);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/legal-analyses/${CLIENT_A_LEGAL_ANALYSIS_ID}`,
      true,
      { 'x-test-user-id': 'portal-user-001', 'x-test-role': 'CLIENT' }
    );

    expect(response.status).toBe(403);
  });
});

describe('SEC-0B1: DTO leak assertions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_AI_ANONYMIZATION = 'true';
    process.env.ENABLE_LEGAL_ANALYSES = 'true';

    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.ENABLE_AI_ANONYMIZATION;
    delete process.env.ENABLE_LEGAL_ANALYSES;
  });

  it('list endpoint returns Summary DTO (no redactedText, no redactedItems)', async () => {
    setupCaseMock(mockCaseRecordA);
    (prisma.anonymousDocument.findMany as jest.Mock).mockResolvedValueOnce([mockAnonymousDocumentA]);
    (mockAnonymizeService.listAnonymousDocumentsByCase as jest.Mock).mockResolvedValueOnce([mockAnonymousDocumentA]);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/anonymous-documents?caseId=${CLIENT_A_CASE_ID}`,
      true,
      { 'x-test-user-id': LAWYER_USER_ID, 'x-test-role': 'LAWYER' }
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    const doc = (response.body as any[])[0];
    expect(doc.id).toBe(CLIENT_A_ANON_DOC_ID);
    expect(doc.name).toBe('[ANONYMIZED] Test Document A');
    expect(doc.redactedText).toBeUndefined();
    expect(doc.redactedItems).toBeUndefined();
    expect(doc.customPrompt).toBeUndefined();
    expect(doc.rehydratedContent).toBeUndefined();
    expect(doc.aiResponseText).toBeUndefined();
  });

  it('single doc endpoint returns Working DTO for collaborator (no PII)', async () => {
    const nonAssignedCase = { ...mockCaseRecordA, assignedLawyerId: 'other-lawyer', createdById: 'other-user' };
    (prisma.case.findUnique as jest.Mock)
      .mockImplementationOnce(async ({ where }: any) => {
        if (where.id === CLIENT_A_CASE_ID) return nonAssignedCase;
        return null;
      })
      .mockResolvedValueOnce(nonAssignedCase);
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'collab-1' });
    (prisma.anonymousDocument.findUnique as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);
    (mockAnonymizeService.getAnonymousDocument as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/anonymous-documents/${CLIENT_A_ANON_DOC_ID}`,
      true,
      { 'x-test-user-id': 'random-lawyer-001', 'x-test-role': 'LAWYER' }
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: CLIENT_A_ANON_DOC_ID,
      redactedText: 'Redacted content for document A',
      customPrompt: 'Review for risks',
    });
    expect((response.body as any).rehydratedContent).toBeUndefined();
    expect((response.body as any).aiResponseText).toBeUndefined();
  });

  it('legal analysis list returns Summary DTO (no analysisText, no PII)', async () => {
    (prisma.document.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
      if (where.id === 'doc-client-a-001') return { id: 'doc-client-a-001', caseId: CLIENT_A_CASE_ID };
      return null;
    });
    setupCaseMock(mockCaseRecordA);
    (mockLegalAnalysesService.listLegalAnalyses as jest.Mock).mockResolvedValueOnce([mockLegalAnalysisA]);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/documents/doc-client-a-001/legal-analyses`,
      true,
      { 'x-test-user-id': LAWYER_USER_ID, 'x-test-role': 'LAWYER' }
    );

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    const analysis = (response.body as any[])[0];
    expect(analysis.id).toBe(CLIENT_A_LEGAL_ANALYSIS_ID);
    expect(analysis.title).toBe('Legal Analysis A');
    expect(analysis.analysisText).toBeUndefined();
    expect(analysis.aiToolName).toBeUndefined();
    expect(analysis.anonymizedInputSnapshot).toBeUndefined();
  });
});

describe('SEC-0B1: Role matrix tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENABLE_AI_ANONYMIZATION = 'true';
    process.env.ENABLE_LEGAL_ANALYSES = 'true';

    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.ENABLE_AI_ANONYMIZATION;
    delete process.env.ENABLE_LEGAL_ANALYSES;
  });

  it('returns Sensitive DTO for ADMIN on anonymous document', async () => {
    setupCaseMock(mockCaseRecordA);
    (prisma.anonymousDocument.findUnique as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);
    (mockAnonymizeService.getAnonymousDocument as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);
    (prisma.case.findUnique as jest.Mock)
      .mockImplementationOnce(async ({ where }: any) => {
        if (where.id === CLIENT_A_CASE_ID) return mockCaseRecordA;
        return null;
      })
      .mockResolvedValueOnce(mockCaseRecordA);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/anonymous-documents/${CLIENT_A_ANON_DOC_ID}`,
      true,
      { 'x-test-user-id': ADMIN_USER_ID, 'x-test-role': 'ADMIN' }
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: CLIENT_A_ANON_DOC_ID,
      rehydratedContent: 'Rehydrated content for A',
      aiResponseText: 'AI response for A',
    });
  });

  it('returns Sensitive DTO for ADMIN on legal analysis', async () => {
    (prisma.legalAnalysis.findUnique as jest.Mock).mockResolvedValueOnce(mockLegalAnalysisA);
    setupCaseMock(mockCaseRecordA);
    (mockLegalAnalysesService.getLegalAnalysis as jest.Mock).mockResolvedValueOnce(mockLegalAnalysisA);
    (prisma.case.findUnique as jest.Mock)
      .mockImplementationOnce(async ({ where }: any) => {
        if (where.id === CLIENT_A_CASE_ID) return mockCaseRecordA;
        return null;
      })
      .mockResolvedValueOnce(mockCaseRecordA);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/legal-analyses/${CLIENT_A_LEGAL_ANALYSIS_ID}`,
      true,
      { 'x-test-user-id': ADMIN_USER_ID, 'x-test-role': 'ADMIN' }
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: CLIENT_A_LEGAL_ANALYSIS_ID,
      aiToolName: 'GPT-4',
      anonymizedInputSnapshot: 'Sensitive snapshot A',
    });
  });

  it('returns Sensitive DTO for PARTNER on anonymous document', async () => {
    setupCaseMock(mockCaseRecordA);
    (prisma.anonymousDocument.findUnique as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);
    (mockAnonymizeService.getAnonymousDocument as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);
    (prisma.case.findUnique as jest.Mock)
      .mockImplementationOnce(async ({ where }: any) => {
        if (where.id === CLIENT_A_CASE_ID) return mockCaseRecordA;
        return null;
      })
      .mockResolvedValueOnce(mockCaseRecordA);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/anonymous-documents/${CLIENT_A_ANON_DOC_ID}`,
      true,
      { 'x-test-user-id': 'partner-user-001', 'x-test-role': 'PARTNER' }
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: CLIENT_A_ANON_DOC_ID,
      rehydratedContent: 'Rehydrated content for A',
      aiResponseText: 'AI response for A',
    });
  });

  it('returns Sensitive DTO for assigned lawyer on anonymous document', async () => {
    setupCaseMock(mockCaseRecordA);
    (prisma.anonymousDocument.findUnique as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);
    (mockAnonymizeService.getAnonymousDocument as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);
    (prisma.case.findUnique as jest.Mock)
      .mockImplementationOnce(async ({ where }: any) => {
        if (where.id === CLIENT_A_CASE_ID) return mockCaseRecordA;
        return null;
      })
      .mockResolvedValueOnce(mockCaseRecordA);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/anonymous-documents/${CLIENT_A_ANON_DOC_ID}`,
      true,
      { 'x-test-user-id': LAWYER_USER_ID, 'x-test-role': 'LAWYER' }
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: CLIENT_A_ANON_DOC_ID,
      rehydratedContent: 'Rehydrated content for A',
      aiResponseText: 'AI response for A',
    });
  });

  it('returns 403 for non-assigned, non-collaborating lawyer', async () => {
    const nonAssignedCase = { ...mockCaseRecordA, assignedLawyerId: 'other-lawyer', createdById: 'other-user' };
    (prisma.case.findUnique as jest.Mock)
      .mockImplementationOnce(async ({ where }: any) => {
        if (where.id === CLIENT_A_CASE_ID) return nonAssignedCase;
        return null;
      });
    (prisma.anonymousDocument.findUnique as jest.Mock).mockResolvedValueOnce(mockAnonymousDocumentA);

    const response = await requestJson(
      createApp(), 'GET',
      `/api/v1/anonymous-documents/${CLIENT_A_ANON_DOC_ID}`,
      true,
      { 'x-test-user-id': 'random-lawyer-001', 'x-test-role': 'LAWYER' }
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      status: 403,
      code: 'CASE_ACCESS_FORBIDDEN',
    });
  });
});
