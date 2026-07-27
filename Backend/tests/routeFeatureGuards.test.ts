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
    client: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    communication: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    communicationAttachment: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    timelineEvent: {
      create: jest.fn(),
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
import clientPortalRoutes from '../src/routes/clientPortal';

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
  app.use('/client-portal', clientPortalRoutes);
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
    delete process.env.ENABLE_CLIENT_PORTAL;

    (prisma.communication.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.communication.count as jest.Mock).mockResolvedValue(0);
    (prisma.communicationAttachment.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
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

  it('keeps authentication ahead of the read-only communications list', async () => {
    const response = await requestJson(createApp(), 'GET', '/communications', false);

    expect(response.status).toBe(401);
    expect(prisma.communication.findMany).not.toHaveBeenCalled();
  });

  it('allows authenticated read-only communications list when persistence is disabled', async () => {
    const createdAt = new Date('2026-06-26T10:00:00.000Z');
    const updatedAt = new Date('2026-06-26T10:05:00.000Z');
    (prisma.communication.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'communication-1',
        type: 'EMAIL',
        subject: 'Client question',
        senderName: 'Client Sender',
        senderEmail: 'client@example.com',
        recipientName: 'Lawyer',
        recipientEmail: 'lawyer@example.test',
        content: '  This is a longer raw message body that should only be exposed as a compact preview.  ',
        summary: 'Client asks a question.',
        caseId: 'case-1',
        clientId: 'client-1',
        documentId: null,
        createdById: 'user-1',
        createdAt,
        updatedAt,
      },
    ]);
    (prisma.communication.count as jest.Mock).mockResolvedValue(1);
    (prisma.communicationAttachment.findMany as jest.Mock).mockResolvedValue([
      { communicationId: 'communication-1' },
    ]);
    (prisma.task.findMany as jest.Mock).mockResolvedValue([
      { sourceCommunicationId: 'communication-1' },
      { sourceCommunicationId: 'communication-1' },
    ]);

    const response = await requestJson(createApp(), 'GET', '/communications?limit=8');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      communications: [
        {
          id: 'communication-1',
          type: 'EMAIL',
          subject: 'Client question',
          senderName: 'Client Sender',
          senderEmail: 'client@example.com',
          recipientName: 'Lawyer',
          recipientEmail: 'lawyer@example.test',
          summary: 'Client asks a question.',
          contentPreview: 'This is a longer raw message body that should only be exposed as a compact preview.',
          caseId: 'case-1',
          clientId: 'client-1',
          documentId: null,
          createdById: 'user-1',
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          attachmentCount: 1,
          sourceTaskCount: 2,
        },
      ],
      pagination: {
        total: 1,
        limit: 8,
        offset: 0,
      },
    });
    expect(process.env.ENABLE_COMMUNICATIONS_PERSISTENCE).toBeUndefined();
  });

  it('keeps mutating communication endpoints feature-gated when persistence is disabled', async () => {
    const response = await requestJson(createApp(), 'POST', '/communications');

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'COMMUNICATIONS',
      reason: 'DATABASE_FOUNDATION_NOT_DEPLOYED',
    });
    expect(prisma.communication.create).not.toHaveBeenCalled();
  });

  it('clamps unsafe communications list limits and avoids relation includes', async () => {
    const response = await requestJson(createApp(), 'GET', '/communications?limit=500&offset=bad');

    expect(response.status).toBe(200);
    expect(prisma.communication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        skip: 0,
        select: expect.objectContaining({
          id: true,
          type: true,
          subject: true,
          createdById: true,
          createdAt: true,
          updatedAt: true,
        }),
      })
    );
    expect((prisma.communication.findMany as jest.Mock).mock.calls[0][0]).not.toHaveProperty('include');
    expect(response.body).toMatchObject({
      communications: [],
      pagination: { total: 0, limit: 50, offset: 0 },
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
      .mockResolvedValueOnce({ caseId: 'case-1', preparedById: 'user-1' })
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

  it('blocks same-case users from modifying another preparer handoff', async () => {
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue({
      caseId: 'case-1',
      preparedById: 'worker-1',
    });
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-1',
    });

    const response = await requestJson(
      createApp(),
      'PATCH',
      '/handoff-packages/package-1'
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'HANDOFF_WRITE_FORBIDDEN' });
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
  });

  it('rejects a preparer attempting to review their own handoff', async () => {
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue({
      caseId: 'case-1',
      preparedById: 'user-1',
    });
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-1',
    });

    const response = await requestJson(
      createApp(),
      'POST',
      '/handoff-packages/package-1/review'
    );

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'HANDOFF_SELF_REVIEW_FORBIDDEN' });
    expect(prisma.lawyerHandoffPackage.update).not.toHaveBeenCalled();
  });

  it('lets the assigned lawyer reach handoff review validation for another preparer', async () => {
    process.env.ENABLE_HANDOFF_PACKAGES = 'true';
    (prisma.lawyerHandoffPackage.findUnique as jest.Mock).mockResolvedValue({
      caseId: 'case-1',
      preparedById: 'worker-1',
    });
    (prisma.case.findUnique as jest.Mock).mockResolvedValue({
      id: 'case-1',
      assignedLawyerId: 'user-1',
    });

    const response = await requestJson(
      createApp(),
      'POST',
      '/handoff-packages/package-1/review'
    );

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'DECISION_REQUIRED' });
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

  // ── Client portal RC2F security patch ──────────────────────────────────────

  it.each([
    ['GET', '/client-portal/summary/client-1'],
    ['GET', '/client-portal/departments/client-1'],
    ['GET', '/client-portal/departments/dept-1/matters'],
    ['GET', '/client-portal/matters/matter-1'],
    ['GET', '/client-portal/matters/matter-1/time-log'],
    ['GET', '/client-portal/export/client-1'],
  ])('client portal %s %s returns 501 when feature is disabled (unauthenticated)', async (_method, path) => {
    const response = await requestJson(createApp(), 'GET', path, false);

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
    });
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain('prisma');
  });

  it.each([
    ['GET', '/client-portal/summary/client-1'],
    ['GET', '/client-portal/departments/client-1'],
    ['GET', '/client-portal/departments/dept-1/matters'],
    ['GET', '/client-portal/matters/matter-1'],
    ['GET', '/client-portal/matters/matter-1/time-log'],
    ['GET', '/client-portal/export/client-1'],
  ])('client portal %s %s returns 501 when feature is disabled (authenticated)', async (_method, path) => {
    const response = await requestJson(createApp(), 'GET', path, true);

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
    });
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain('prisma');
  });

  it('spoofed x-user-id header cannot access client portal data', async () => {
    const response = await requestJson(
      createApp(),
      'GET',
      '/client-portal/summary/client-1',
      false,
      { 'x-user-id': 'spoofed-client-id' }
    );

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      code: 'FEATURE_NOT_AVAILABLE',
      feature: 'CLIENT_PORTAL',
      reason: 'CLIENT_PORTAL_NOT_ENABLED',
    });
  });

  it('client portal action completion authenticates then returns the disabled action gate', async () => {
    const unauthenticated = await requestJson(
      createApp(),
      'POST',
      '/client-portal/action-requests/action-1/complete',
      false
    );
    expect(unauthenticated.status).toBe(401);

    const authenticated = await requestJson(
      createApp(),
      'POST',
      '/client-portal/action-requests/action-1/complete',
      true,
      { 'x-test-role': 'CLIENT' }
    );
    expect(authenticated.status).toBe(503);
    expect(authenticated.body).toMatchObject({
      status: 503,
      code: 'CLIENT_PORTAL_ACTIONS_DISABLED',
    });
  });

  it('no Prisma data queries run when client portal is disabled', async () => {
    await requestJson(createApp(), 'GET', '/client-portal/summary/client-1', false);
    await requestJson(createApp(), 'GET', '/client-portal/export/client-1', true);
    await requestJson(createApp(), 'GET', '/client-portal/matters/matter-1/time-log', false);

    // No Prisma mock on the shared prisma object should have been called
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.findMany).not.toHaveBeenCalled();
    expect(prisma.lawyerHandoffPackage.create).not.toHaveBeenCalled();
  });
});
