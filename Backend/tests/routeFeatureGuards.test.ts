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

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    case: {
      findUnique: jest.fn(),
    },
    caseCollaborator: {
      findFirst: jest.fn(),
    },
    document: {
      findUnique: jest.fn(),
    },
    lawyerHandoffPackage: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import clientsRoutes from '../src/modules/clients/routes';
import clauseLibraryRoutes from '../src/modules/clause-library/routes';
import communicationsRoutes from '../src/modules/communications/routes';
import reviewSuggestionsRoutes from '../src/modules/documents/reviewSuggestions.routes';
import handoffPackagesRoutes from '../src/modules/handoff-packages/routes';
import legalAnalysesRoutes from '../src/modules/legal-analyses/routes';
import reviewNotesRoutes from '../src/modules/review-notes/routes';
import timesheetReportRoutes from '../src/modules/timesheet-reports/routes';

type TestResponse = {
  status: number;
  body: unknown;
};

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
      request.end();
    });
  });
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/documents/:documentId/review-suggestions', reviewSuggestionsRoutes);
  app.use('/clients', clientsRoutes);
  app.use('/clause-library', clauseLibraryRoutes);
  app.use('/communications', communicationsRoutes);
  app.use('/', legalAnalysesRoutes);
  app.use('/contracts', reviewNotesRoutes);
  app.use('/timesheet-reports', timesheetReportRoutes);
  app.use('/', handoffPackagesRoutes);
  return app;
}

describe('database foundation route guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_DOCUMENT_REVIEW_SUGGESTIONS;
    delete process.env.ENABLE_CLIENT_HOUSE_STYLE;
    delete process.env.ENABLE_CLAUSE_LIBRARY;
    delete process.env.ENABLE_COMMUNICATIONS_PERSISTENCE;
    delete process.env.ENABLE_LEGAL_ANALYSES;
    delete process.env.ENABLE_CONTRACT_REVIEW_NOTES;
    delete process.env.ENABLE_TIMESHEET_REPORT_PERSISTENCE;
    delete process.env.ENABLE_HANDOFF_PACKAGES;
  });

  it('keeps authentication ahead of the document review guard', async () => {
    const response = await requestJson(
      createApp(),
      'GET',
      '/documents/document-1/review-suggestions',
      false
    );

    expect(response.status).toBe(401);
  });

  it('returns the controlled unavailable response for guarded review routes', async () => {
    const response = await requestJson(
      createApp(),
      'GET',
      '/documents/document-1/review-suggestions'
    );

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'DOCUMENT_REVIEW_SUGGESTIONS',
      reason: 'DATABASE_FOUNDATION_NOT_DEPLOYED',
    });
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain('prisma');
  });

  it('preserves the demo-safe empty house-style read and guards writes', async () => {
    const app = createApp();
    const readResponse = await requestJson(app, 'GET', '/clients/client-1/house-style');
    const writeResponse = await requestJson(app, 'PUT', '/clients/client-1/house-style');

    expect(readResponse).toEqual({ status: 200, body: null });
    expect(writeResponse.status).toBe(501);
    expect(writeResponse.body).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_HOUSE_STYLE',
    });
  });

  it('keeps stateless timesheet templates available and guards persistence', async () => {
    const app = createApp();
    const templatesResponse = await requestJson(app, 'GET', '/timesheet-reports/templates');
    const persistenceResponse = await requestJson(app, 'POST', '/timesheet-reports/instances');

    expect(templatesResponse.status).toBe(200);
    expect(Array.isArray(templatesResponse.body)).toBe(true);
    expect(persistenceResponse.status).toBe(501);
    expect(persistenceResponse.body).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'TIMESHEET_REPORT_PERSISTENCE',
    });
  });

  it('preserves empty handoff reads and guards handoff writes', async () => {
    const app = createApp();
    const readResponse = await requestJson(app, 'GET', '/cases/case-1/handoff-packages');
    const writeResponse = await requestJson(app, 'POST', '/cases/case-1/handoff-packages');

    expect(readResponse).toEqual({ status: 200, body: [] });
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.findMany).not.toHaveBeenCalled();
    expect(writeResponse.status).toBe(501);
    expect(writeResponse.body).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'LAWYER_HANDOFF_PACKAGES',
    });
  });

  it('keeps authentication ahead of disabled handoff reads', async () => {
    const response = await requestJson(
      createApp(),
      'GET',
      '/cases/case-1/handoff-packages',
      false
    );

    expect(response.status).toBe(401);
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.findMany).not.toHaveBeenCalled();
  });

  it('keeps authentication ahead of disabled handoff writes', async () => {
    const response = await requestJson(
      createApp(),
      'POST',
      '/cases/case-1/handoff-packages',
      false
    );

    expect(response.status).toBe(401);
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.create).not.toHaveBeenCalled();
  });

  it('returns controlled unavailable for disabled single-package reads', async () => {
    const response = await requestJson(
      createApp(),
      'GET',
      '/handoff-packages/package-1'
    );

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'LAWYER_HANDOFF_PACKAGES',
      reason: 'DATABASE_FOUNDATION_NOT_DEPLOYED',
    });
    expect(prisma.lawyerHandoffPackage.findUnique).not.toHaveBeenCalled();
  });

  it('blocks enabled handoff reads for users without case access', async () => {
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-2',
    });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(
      createApp(),
      'GET',
      '/cases/case-1/handoff-packages'
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'HANDOFF_ACCESS_FORBIDDEN',
    });
    expect(prisma.lawyerHandoffPackage.findMany).not.toHaveBeenCalled();
  });

  it('allows enabled handoff reads for the assigned case lawyer', async () => {
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-1',
    });
    (prisma.lawyerHandoffPackage.findMany as jest.Mock).mockResolvedValue([]);

    const response = await requestJson(
      createApp(),
      'GET',
      '/cases/case-1/handoff-packages'
    );

    expect(response).toEqual({ status: 200, body: [] });
    expect(prisma.caseCollaborator.findFirst).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.findMany).toHaveBeenCalledWith({
      where: {
        caseId: 'case-1',
        status: { not: 'ARCHIVED' },
      },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('blocks enabled package reads when the user cannot access the owning case', async () => {
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue({
      caseId: 'case-1',
    });
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-2',
    });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(
      createApp(),
      'GET',
      '/handoff-packages/package-1'
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'HANDOFF_ACCESS_FORBIDDEN',
    });
    expect(prisma.lawyerHandoffPackage.findUnique).toHaveBeenCalledTimes(1);
  });

  it('keeps authentication ahead of handoff archive', async () => {
    const response = await requestJson(
      createApp(),
      'POST',
      '/handoff-packages/package-1/archive',
      false
    );

    expect(response.status).toBe(401);
    expect(prisma.lawyerHandoffPackage.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
  });

  it('returns controlled unavailable for disabled handoff archive', async () => {
    const response = await requestJson(
      createApp(),
      'POST',
      '/handoff-packages/package-1/archive'
    );

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'LAWYER_HANDOFF_PACKAGES',
      reason: 'DATABASE_FOUNDATION_NOT_DEPLOYED',
    });
    expect(prisma.lawyerHandoffPackage.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
  });

  it('blocks handoff archive when the user cannot access the owning case', async () => {
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue({
      caseId: 'case-1',
    });
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-2',
    });
    (prisma.caseCollaborator.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(
      createApp(),
      'POST',
      '/handoff-packages/package-1/archive'
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'HANDOFF_ACCESS_FORBIDDEN',
    });
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
  });

  it('archives a package for an authorized same-case user', async () => {
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    const existing = {
      id: 'package-1',
      caseId: 'case-1',
      status: 'DRAFT',
      packageType: 'STANDARD',
      sourceDocumentId: null,
      anonymizedDocumentId: null,
      generatedContractId: null,
      legalAnalysisId: null,
      reviewNotesId: null,
      preparerSummary: null,
      preparedById: 'user-1',
      submittedAt: null,
      reviewedById: null,
      reviewedAt: null,
      reviewDecision: null,
      reviewComment: null,
      createdAt: new Date('2026-06-23T00:00:00.000Z'),
      updatedAt: new Date('2026-06-23T00:00:00.000Z'),
    };
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock)
      .mockResolvedValueOnce({ caseId: 'case-1' })
      .mockResolvedValueOnce(existing);
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-1',
    });
    (prisma.lawyerHandoffPackage.update as jest.Mock).mockResolvedValue({
      ...existing,
      status: 'ARCHIVED',
    });

    const response = await requestJson(
      createApp(),
      'POST',
      '/handoff-packages/package-1/archive'
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'package-1',
      caseId: 'case-1',
      status: 'ARCHIVED',
    });
    expect(prisma.lawyerHandoffPackage.update).toHaveBeenCalledWith({
      where: { id: 'package-1' },
      data: { status: 'ARCHIVED' },
    });
  });

  it('returns controlled not found for a missing handoff archive target', async () => {
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await requestJson(
      createApp(),
      'POST',
      '/handoff-packages/missing-package/archive',
      true,
      { 'x-test-role': 'ADMIN' }
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'HANDOFF_PACKAGE_NOT_FOUND',
    });
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/clause-library/clauses', 'CLAUSE_LIBRARY'],
    ['GET', '/communications/communication-1', 'COMMUNICATIONS'],
    ['GET', '/documents/document-1/legal-analyses', 'LEGAL_ANALYSES'],
    ['GET', '/contracts/generation-1/review-notes', 'CONTRACT_REVIEW_NOTES'],
  ])('guards %s %s without leaking Prisma errors', async (method, path, feature) => {
    const response = await requestJson(createApp(), method, path);

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature,
      reason: 'DATABASE_FOUNDATION_NOT_DEPLOYED',
    });
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain('prisma');
  });
});
