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

const contractsServiceMock = {
  getTemplates: jest.fn(),
  getTemplateById: jest.fn(),
  saveTemplateFile: jest.fn(),
  createTemplate: jest.fn(),
  generateWithBundle: jest.fn(),
  getBundleOptions: jest.fn(),
  generatePreview: jest.fn(),
  getCaseContracts: jest.fn(),
  getContractComparison: jest.fn(),
  getEditDraft: jest.fn(),
  saveEditDraft: jest.fn(),
  generateRevisionFromEditDraft: jest.fn(),
  getEditSuggestions: jest.fn(),
  uploadToSharePoint: jest.fn(),
  cleanupExpiredPreviews: jest.fn(),
  finalizeContract: jest.fn(),
  createContractRevision: jest.fn(),
  downloadCaseBundle: jest.fn(),
  rejectApproval: jest.fn(),
  backToReview: jest.fn(),
  getContractTimeline: jest.fn(),
};

jest.mock('../src/modules/contracts/services', () => ({
  __esModule: true,
  default: contractsServiceMock,
}));

jest.mock('../src/prisma/prisma.service', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    contractGeneration: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    contractTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    timelineEvent: { create: jest.fn() },
  },
}));

import { prisma } from '../src/prisma/prisma.service';
import contractsRoutes from '../src/modules/contracts/routes';

type TestResponse = {
  status: number;
  body: unknown;
};

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/contracts', contractsRoutes);
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

function expectSafeDisabledResponse(response: TestResponse): void {
  expect(response.status).toBe(501);
  expect(response.body).toMatchObject({
    status: 501,
    code: 'FEATURE_NOT_AVAILABLE',
    feature: 'CONTRACTS',
    reason: 'CONTRACTS_NOT_ENABLED',
  });

  const serialized = JSON.stringify(response.body).toLowerCase();
  expect(serialized).not.toContain('filepath');
  expect(serialized).not.toContain('templatepath');
  expect(serialized).not.toContain('templatedata');
  expect(serialized).not.toContain('sharepoint');
  expect(serialized).not.toContain('stack');
  expect(serialized).not.toContain('uploads');
  expect(serialized).not.toContain('generated');
}

function expectNoContractsSideEffects(): void {
  for (const serviceMock of Object.values(contractsServiceMock)) {
    expect(serviceMock).not.toHaveBeenCalled();
  }
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
  expect(prisma.contractGeneration.findUnique).not.toHaveBeenCalled();
  expect(prisma.contractGeneration.create).not.toHaveBeenCalled();
  expect(prisma.contractGeneration.update).not.toHaveBeenCalled();
  expect(prisma.contractGeneration.updateMany).not.toHaveBeenCalled();
  expect(prisma.contractGeneration.findMany).not.toHaveBeenCalled();
  expect(prisma.contractGeneration.delete).not.toHaveBeenCalled();
  expect(prisma.contractTemplate.findMany).not.toHaveBeenCalled();
  expect(prisma.contractTemplate.findUnique).not.toHaveBeenCalled();
  expect(prisma.contractTemplate.create).not.toHaveBeenCalled();
  expect(prisma.contractTemplate.updateMany).not.toHaveBeenCalled();
  expect(prisma.timelineEvent.create).not.toHaveBeenCalled();
}

describe('contracts generation quarantine boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ENABLE_CONTRACT_GENERATION;
    delete process.env.ENABLE_CONTRACT_GENERATION_STORAGE_MODEL;
  });

  it('requires authentication before contract feature checks', async () => {
    const response = await requestJson(createApp(), 'POST', '/contracts/generate', false, {
      templateId: 'template-1',
      data: { name: 'Client' },
    });

    expect(response.status).toBe(401);
    expectNoContractsSideEffects();
  });

  it.each([
    ['POST', '/contracts/templates', undefined],
    ['POST', '/contracts/generate', { templateId: 'template-1', data: { name: 'Client' } }],
    ['POST', '/contracts/preview', { templateId: 'template-1', data: { name: 'Client' } }],
    ['POST', '/contracts/contract-1/upload-sharepoint', undefined],
    ['POST', '/contracts/cleanup', undefined],
    ['POST', '/contracts/contract-1/finalize', undefined],
    ['POST', '/contracts/contract-1/create-revision', undefined],
    ['GET', '/contracts/templates', undefined],
    ['GET', '/contracts/case/case-1', undefined],
  ])('returns safe disabled response for %s %s', async (method, path, body) => {
    const response = await requestJson(createApp(), method, path, true, body);

    expectSafeDisabledResponse(response);
    expectNoContractsSideEffects();
  });

  it('does not enable dangerous contract behavior with only the legacy flag', async () => {
    process.env.ENABLE_CONTRACT_GENERATION = 'true';

    const response = await requestJson(createApp(), 'POST', '/contracts/generate', true, {
      templateId: 'template-1',
      caseId: 'case-1',
      data: { privilegedLegalText: 'do not process' },
    });

    expectSafeDisabledResponse(response);
    expectNoContractsSideEffects();
  });
});
