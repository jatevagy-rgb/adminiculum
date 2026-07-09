import express, { Express, NextFunction, Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';

// Synthetic placeholder only — NEVER real legal text. This marker must never
// appear in any AI/provider/prompt mock payload, response body, or log line.
const SYNTHETIC = 'SYNTHETIC_WORKSPACE_TEXT_DO_NOT_LOG';

// ---------------------------------------------------------------------------
// Auth mock: bearer `test-token` -> authenticated LAWYER user.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Anonymize (AI-ready prompt builder) service mock — spied so we can assert it
// is NEVER invoked from the workspace-text path and NEVER receives the marker.
// ---------------------------------------------------------------------------
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

// Authorization pass-through: this test proves the AI/prompt boundary, not
// authz (which has its own suite). With gates on, both guards call next().
jest.mock('../src/modules/documents/authorization', () => ({
  requireDocumentReadAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireDocumentManageAccess: (_req: Request, _res: Response, next: NextFunction) => next(),
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
import documentsRoutes from '../src/modules/documents/routes';
import anonymizeRoutes from '../src/modules/anonymize/routes';

type TestResponse = { status: number; body: unknown };

function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/documents', documentsRoutes);
  app.use('/', anonymizeRoutes);
  return app;
}

function requestJson(
  app: Express,
  method: string,
  reqPath: string,
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
          path: reqPath,
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
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : null });
          });
        }
      );
      request.on('error', (error) => {
        server.close();
        reject(error);
      });
      if (payload) request.write(payload);
      request.end();
    });
  });
}

/** Serialize every argument passed to a jest mock across all calls. */
function serializeMockCalls(mock: jest.Mock): string {
  return JSON.stringify(mock.mock.calls);
}

function anonymizeNeverSawMarker(): void {
  for (const mock of Object.values(anonymizeServiceMock)) {
    expect(serializeMockCalls(mock)).not.toContain(SYNTHETIC);
  }
}

function anonymizeNeverCalled(): void {
  for (const mock of Object.values(anonymizeServiceMock)) {
    expect(mock).not.toHaveBeenCalled();
  }
}

describe('documents workspace text — AI/provider/prompt gate boundary', () => {
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_DOCUMENT_PROCESSING;
    delete process.env.ENABLE_DOCUMENT_AI_PRIVACY_MODEL;
    delete process.env.ENABLE_AI_ANONYMIZATION;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  function allLoggedText(): string {
    return JSON.stringify([...errorSpy.mock.calls, ...logSpy.mock.calls]);
  }

  it('with the Document/AI privacy gate off, the workspace-text write route is 501 and never reaches the prompt/provider path', async () => {
    const response = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', true, {
      text: SYNTHETIC,
    });

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({
      status: 501,
      code: 'FEATURE_NOT_AVAILABLE',
      reason: 'DOCUMENT_AI_NOT_ENABLED',
    });
    // No provider/prompt path invoked; raw marker never forwarded, returned, or logged.
    anonymizeNeverCalled();
    anonymizeNeverSawMarker();
    expect(JSON.stringify(response.body)).not.toContain(SYNTHETIC);
    expect(allLoggedText()).not.toContain(SYNTHETIC);
    // The workspace write must never touch persistence when the gate is off.
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('with the gate off, the workspace-text read route is 501 and never reaches the prompt/provider path', async () => {
    const response = await requestJson(createApp(), 'GET', '/documents/doc-1/text', true);

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE', reason: 'DOCUMENT_AI_NOT_ENABLED' });
    anonymizeNeverCalled();
    expect(prisma.document.findUnique).not.toHaveBeenCalled();
  });

  it('legacy flags alone (processing + anonymization, no privacy model) do not open the workspace→prompt path', async () => {
    process.env.ENABLE_DOCUMENT_PROCESSING = 'true';
    process.env.ENABLE_AI_ANONYMIZATION = 'true';
    // ENABLE_DOCUMENT_AI_PRIVACY_MODEL intentionally left unset.

    const response = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', true, {
      text: SYNTHETIC,
    });

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({ reason: 'DOCUMENT_AI_NOT_ENABLED' });
    anonymizeNeverCalled();
    anonymizeNeverSawMarker();
    expect(prisma.document.create).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain(SYNTHETIC);
  });

  it('the anonymize/prompt route is itself privacy-gated and returns a content-free 501 when the gate is off', async () => {
    const response = await requestJson(createApp(), 'POST', '/documents/doc-1/anonymize', true, {
      sourceText: SYNTHETIC,
      aiTask: 'REVIEW_RISKS',
    });

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE', reason: 'DOCUMENT_AI_NOT_ENABLED' });
    anonymizeNeverCalled();
    expect(JSON.stringify(response.body)).not.toContain(SYNTHETIC);
  });

  it('even fully enabled (test-only), the workspace save path never invokes the AI/prompt/provider path with raw text', async () => {
    process.env.ENABLE_DOCUMENT_PROCESSING = 'true';
    process.env.ENABLE_DOCUMENT_AI_PRIVACY_MODEL = 'true';
    process.env.ENABLE_AI_ANONYMIZATION = 'true';

    (prisma.document.findUnique as jest.Mock).mockResolvedValue({
      id: 'doc-1',
      caseId: 'case-1',
      clientId: 'client-1',
      name: 'Eredeti',
      category: 'INTERNAL_MEMO',
    });
    (prisma.document.create as jest.Mock).mockResolvedValue({
      id: 'doc-2',
      name: 'Eredeti — módosított munkapéldány',
      description: 'x',
      caseId: 'case-1',
      clientId: 'client-1',
      fileName: 'Eredeti — módosított munkapéldány',
      documentType: 'MODIFIED_WORKING_COPY',
      category: 'INTERNAL_MEMO',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      // NOTE: DTO intentionally omits workspaceText.
    });
    (prisma.timelineEvent.create as jest.Mock).mockResolvedValue({});

    const response = await requestJson(createApp(), 'POST', '/documents/doc-1/save-workspace-version', true, {
      text: SYNTHETIC,
      title: 'Munkapéldány',
    });

    // Persistence succeeded...
    expect(response.status).toBe(201);
    expect(prisma.document.create).toHaveBeenCalledTimes(1);
    // ...but the raw text was NEVER routed into any AI/provider/prompt path,
    // never echoed in the response DTO, and never logged.
    anonymizeNeverCalled();
    anonymizeNeverSawMarker();
    expect(JSON.stringify(response.body)).not.toContain(SYNTHETIC);
    expect(allLoggedText()).not.toContain(SYNTHETIC);
  });

  it('the documents router imports no AI provider / anonymization / prompt module (no static wiring of workspaceText into a prompt path)', () => {
    const routesSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'modules', 'documents', 'routes.ts'),
      'utf8'
    );
    // No provider SDK client.
    expect(routesSource).not.toMatch(/\b(openai|anthropic)\b/i);
    expect(routesSource).not.toMatch(/chat\.completions|messages\.create/i);
    // No import of the anonymization / AI-prompt builder from the documents router.
    expect(routesSource).not.toMatch(/from\s+['"][^'"]*anonymize/i);
    expect(routesSource).not.toMatch(/aiReadyPrompt|buildPrompt|promptBuilder/i);
  });
});
