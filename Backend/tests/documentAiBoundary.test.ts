import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ error: 'No token provided' });
      return;
    }
    req.user = {
      userId: 'user-1',
      email: 'test@example.com',
      role: 'LAWYER',
      authProvider: 'local-jwt',
    };
    next();
  },
}));

const anonymizeServiceMock = {
  anonymizeDocument: jest.fn(),
  getAnonymizationSourceText: jest.fn(),
  getClientRedactionProfile: jest.fn(),
  upsertRedactionProfile: jest.fn(),
  getAnonymousDocument: jest.fn(),
  importAIResponse: jest.fn(),
  saveRehydratedResultToDocument: jest.fn(),
  listAnonymousDocumentsBySource: jest.fn(),
  listAnonymousDocumentsByCase: jest.fn(),
};

jest.mock('../src/modules/anonymize/services', () => ({
  __esModule: true,
  default: anonymizeServiceMock,
}));

const documentsServiceMock = {
  searchDocuments: jest.fn(),
  createDocument: jest.fn(),
  getCaseDocuments: jest.fn(),
  getDocumentById: jest.fn(),
  uploadNewVersion: jest.fn(),
  submitForReview: jest.fn(),
  approveDocument: jest.fn(),
  rejectDocument: jest.fn(),
};

jest.mock('../src/modules/documents/services', () => ({
  __esModule: true,
  default: documentsServiceMock,
}));

const reviewSuggestionsServiceMock = {
  createDocumentReviewSuggestion: jest.fn(),
  listDocumentReviewSuggestions: jest.fn(),
  updateDocumentReviewSuggestionStatus: jest.fn(),
  DocumentReviewSuggestionError: class DocumentReviewSuggestionError extends Error {
    status: number;
    code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
};

jest.mock('../src/modules/documents/reviewSuggestions.service', () => reviewSuggestionsServiceMock);

const legalAnalysesServiceMock = {
  listLegalAnalyses: jest.fn(),
  createLegalAnalysis: jest.fn(),
  getLegalAnalysis: jest.fn(),
  updateLegalAnalysis: jest.fn(),
  deleteLegalAnalysis: jest.fn(),
};

jest.mock('../src/modules/legal-analyses/service', () => ({
  __esModule: true,
  default: legalAnalysesServiceMock,
  LegalAnalysisServiceError: class LegalAnalysisServiceError extends Error {
    statusCode: number;
    code: string;

    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));

jest.mock('../src/modules/documents/textExtractor', () => ({
  extractText: jest.fn(),
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    document: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    timelineEvent: {
      create: jest.fn(),
    },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import anonymizeRoutes from '../src/modules/anonymize/routes';
import documentsRoutes from '../src/modules/documents/routes';
import legalAnalysesRoutes from '../src/modules/legal-analyses/routes';
import { extractText } from '../src/modules/documents/textExtractor';

type TestResponse = {
  status: number;
  body: unknown;
};

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/documents', documentsRoutes);
  app.use('/', anonymizeRoutes);
  app.use('/', legalAnalysesRoutes);
  return app;
}

function requestJson(
  app: Express,
  method: string,
  path: string,
  authenticated = true,
  body?: unknown
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Test server address unavailable'));
        return;
      }

      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: {
            ...(authenticated ? { authorization: 'Bearer test-token' } : {}),
            'content-type': 'application/json',
            ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            server.close();
            const text = Buffer.concat(chunks).toString('utf8');
            resolve({
              status: response.statusCode || 0,
              body: text ? JSON.parse(text) : null,
            });
          });
        }
      );

      request.on('error', (error) => {
        server.close();
        reject(error);
      });

      if (payload) {
        request.write(payload);
      }
      request.end();
    });
  });
}

function expectSafeDocumentAiDisabled(response: TestResponse): void {
  expect(response.status).toBe(501);
  expect(response.body).toMatchObject({
    status: 501,
    code: 'FEATURE_NOT_AVAILABLE',
    reason: 'DOCUMENT_AI_NOT_ENABLED',
  });

  const serialized = JSON.stringify(response.body).toLowerCase();
  expect(serialized).not.toContain('privileged legal text');
  expect(serialized).not.toContain('prompt');
  expect(serialized).not.toContain('filepath');
  expect(serialized).not.toContain('provider');
  expect(serialized).not.toContain('database_url');
  expect(serialized).not.toContain('stack');
  expect(serialized).not.toContain('rehydratedcontent');
  expect(serialized).not.toContain('redactedtext');
}

function expectNoDocumentAiSideEffects(): void {
  for (const serviceMock of Object.values(anonymizeServiceMock)) {
    expect(serviceMock).not.toHaveBeenCalled();
  }
  for (const serviceMock of Object.values(documentsServiceMock)) {
    expect(serviceMock).not.toHaveBeenCalled();
  }
  for (const serviceMock of Object.values(legalAnalysesServiceMock)) {
    expect(serviceMock).not.toHaveBeenCalled();
  }
  expect(reviewSuggestionsServiceMock.createDocumentReviewSuggestion).not.toHaveBeenCalled();
  expect(reviewSuggestionsServiceMock.listDocumentReviewSuggestions).not.toHaveBeenCalled();
  expect(reviewSuggestionsServiceMock.updateDocumentReviewSuggestionStatus).not.toHaveBeenCalled();
  expect(prisma.document.findUnique).not.toHaveBeenCalled();
  expect(prisma.document.create).not.toHaveBeenCalled();
  expect(prisma.timelineEvent.create).not.toHaveBeenCalled();
  expect(extractText).not.toHaveBeenCalled();
}

describe('document AI privacy quarantine boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_AI_ANONYMIZATION;
    delete process.env.ENABLE_DOCUMENT_PROCESSING;
    delete process.env.ENABLE_DOCUMENT_REVIEW_SUGGESTIONS;
    delete process.env.ENABLE_LEGAL_ANALYSES;
    delete process.env.ENABLE_DOCUMENT_AI_PRIVACY_MODEL;
  });

  it('requires authentication before document AI privacy feature checks', async () => {
    const response = await requestJson(createApp(), 'POST', '/documents/document-1/anonymize', false, {
      sourceText: 'privileged legal text',
    });

    expect(response.status).toBe(401);
    expectNoDocumentAiSideEffects();
  });

  it.each([
    ['POST', '/documents/document-1/anonymize', { sourceText: 'privileged legal text' }],
    ['GET', '/documents/document-1/anonymization-source', undefined],
    ['POST', '/anonymous-documents/anon-1/import-ai-response', { aiResponseText: 'privileged legal text' }],
    ['POST', '/anonymous-documents/anon-1/save-as-document', undefined],
    ['GET', '/anonymous-documents/by-source/document-1', undefined],
    ['POST', '/documents', { caseId: 'case-1', fileName: 'secret.docx', fileContent: 'c2VjcmV0' }],
    ['GET', '/documents/document-1/text', undefined],
    ['POST', '/documents/document-1/version', { fileContent: 'c2VjcmV0' }],
    ['POST', '/documents/document-1/save-workspace-version', { text: 'privileged legal text' }],
    ['GET', '/documents/document-1/download', undefined],
    ['POST', '/documents/document-1/review-suggestions', { selectedTextPreview: 'privileged legal text' }],
    ['POST', '/documents/document-1/legal-analyses', { caseId: 'case-1', analysisText: 'privileged legal text' }],
  ])('returns safe disabled response for %s %s', async (method, path, body) => {
    const response = await requestJson(createApp(), method, path, true, body);

    expectSafeDocumentAiDisabled(response);
    expectNoDocumentAiSideEffects();
  });

  it('does not enable document AI behavior with only legacy feature flags', async () => {
    process.env.ENABLE_AI_ANONYMIZATION = 'true';
    process.env.ENABLE_DOCUMENT_PROCESSING = 'true';
    process.env.ENABLE_DOCUMENT_REVIEW_SUGGESTIONS = 'true';
    process.env.ENABLE_LEGAL_ANALYSES = 'true';

    const responses = await Promise.all([
      requestJson(createApp(), 'POST', '/documents/document-1/anonymize', true, {
        sourceText: 'privileged legal text',
      }),
      requestJson(createApp(), 'POST', '/documents', true, {
        caseId: 'case-1',
        fileName: 'secret.docx',
        fileContent: 'c2VjcmV0',
      }),
      requestJson(createApp(), 'POST', '/documents/document-1/legal-analyses', true, {
        caseId: 'case-1',
        analysisText: 'privileged legal text',
      }),
    ]);

    for (const response of responses) {
      expectSafeDocumentAiDisabled(response);
    }
    expectNoDocumentAiSideEffects();
  });
});
