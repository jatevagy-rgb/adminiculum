/**
 * Case Context V2 — route authorization wiring tests.
 *
 * Proves the canonical, narrowest existing permission is applied to each
 * endpoint (no new role matrix):
 *   - every endpoint is behind authenticate + requireWorkforceUser;
 *   - list/detect use case READ access;
 *   - create (PASTED + COMMUNICATION) and anonymize use case MANAGE access;
 *   - a client-portal identity is rejected before any case authorization.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import http from 'http';

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      userId: String(req.headers['x-test-user-id'] || 'user-1'),
      email: 'test@example.com',
      role: String(req.headers['x-test-role'] || 'LAWYER') as any,
      name: 'Teszt',
      authProvider: 'local-jwt',
    };
    next();
  },
}));

jest.mock('../src/modules/cases/authorization', () => ({
  requireCaseReadAccess: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  requireCaseManageAccess: jest.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

jest.mock('../src/modules/case-context/service', () => ({
  createPastedContextSource: jest.fn().mockResolvedValue({ id: 'src-1' }),
  createCommunicationContextSource: jest.fn().mockResolvedValue({ id: 'src-1' }),
  listContextSources: jest.fn().mockResolvedValue([]),
  detectContextSource: jest.fn().mockResolvedValue({ sourceHash: 'h', optionsDigest: 'd', candidates: [] }),
  anonymizeContextSource: jest.fn().mockResolvedValue({ id: 'src-1' }),
}));

import { requireCaseReadAccess, requireCaseManageAccess } from '../src/modules/cases/authorization';
import * as service from '../src/modules/case-context/service';
import caseContextRoutes from '../src/modules/case-context/routes';

const readAccess = requireCaseReadAccess as unknown as jest.Mock;
const manageAccess = requireCaseManageAccess as unknown as jest.Mock;

type TestResponse = { status: number; body: any };

function request(app: Express, method: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') { server.close(); reject(new Error('no addr')); return; }
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        {
          host: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: { authorization: 'Bearer test-token', 'content-type': 'application/json', ...headers },
        },
        (response) => {
          let data = '';
          response.on('data', (chunk) => (data += chunk));
          response.on('end', () => {
            server.close();
            resolve({ status: response.statusCode || 0, body: data ? JSON.parse(data) : null });
          });
        },
      );
      req.on('error', (error) => { server.close(); reject(error); });
      if (payload) req.write(payload);
      req.end();
    });
  });
}

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/', caseContextRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('route authorization wiring', () => {
  it('list is behind case READ access', async () => {
    const res = await request(createApp(), 'GET', '/cases/case-1/context-sources');
    expect(res.status).toBe(200);
    expect(readAccess).toHaveBeenCalled();
    expect(manageAccess).not.toHaveBeenCalled();
    expect(service.listContextSources).toHaveBeenCalled();
  });

  it('PASTED create is behind case MANAGE access', async () => {
    const res = await request(createApp(), 'POST', '/cases/case-1/context-sources', {}, { rawText: 'hello' });
    expect(res.status).toBe(201);
    expect(manageAccess).toHaveBeenCalled();
    expect(readAccess).not.toHaveBeenCalled();
    expect(service.createPastedContextSource).toHaveBeenCalled();
  });

  it('COMMUNICATION create is behind case MANAGE access', async () => {
    const res = await request(createApp(), 'POST', '/cases/case-1/context-sources/from-communication', {}, { communicationId: 'comm-1' });
    expect(res.status).toBe(201);
    expect(manageAccess).toHaveBeenCalled();
    expect(service.createCommunicationContextSource).toHaveBeenCalled();
  });

  it('detect is behind case READ access', async () => {
    const res = await request(createApp(), 'POST', '/cases/case-1/context-sources/src-1/detect', {}, { manualTerms: [] });
    expect(res.status).toBe(200);
    expect(readAccess).toHaveBeenCalled();
    expect(manageAccess).not.toHaveBeenCalled();
    expect(service.detectContextSource).toHaveBeenCalled();
  });

  it('anonymize uses the SAME manage permission as create', async () => {
    const res = await request(createApp(), 'POST', '/cases/case-1/context-sources/src-1/anonymize', {}, { sourceHash: 'h', optionsDigest: 'd', approvedCandidateIds: [] });
    expect(res.status).toBe(200);
    expect(manageAccess).toHaveBeenCalled();
    expect(readAccess).not.toHaveBeenCalled();
    expect(service.anonymizeContextSource).toHaveBeenCalled();
  });

  it('a client-portal identity is rejected before case authorization', async () => {
    const res = await request(createApp(), 'GET', '/cases/case-1/context-sources', { 'x-test-role': 'CLIENT' });
    expect(res.status).toBe(403);
    expect(readAccess).not.toHaveBeenCalled();
    expect(manageAccess).not.toHaveBeenCalled();
    expect(service.listContextSources).not.toHaveBeenCalled();
  });
});

describe('request-shape validation (fail closed)', () => {
  const DETECT = '/cases/case-1/context-sources/src-1/detect';
  const ANONYMIZE = '/cases/case-1/context-sources/src-1/anonymize';

  it('detect accepts a valid canonical manual-term category and reaches the service', async () => {
    const res = await request(createApp(), 'POST', DETECT, {}, { manualTerms: [{ term: 'Kovács Péter', category: 'PERSON' }] });
    expect(res.status).toBe(200);
    expect(service.detectContextSource).toHaveBeenCalled();
  });

  it('detect rejects an unsupported manual-term category before reaching the service', async () => {
    const res = await request(createApp(), 'POST', DETECT, {}, { manualTerms: [{ term: 'Kovács Péter', category: 'NOT_A_CATEGORY' }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SENSITIVE_CATEGORY');
    expect(service.detectContextSource).not.toHaveBeenCalled();
  });

  it('detect rejects manualTerms supplied as an object', async () => {
    const res = await request(createApp(), 'POST', DETECT, {}, { manualTerms: { term: 'x', category: 'PERSON' } });
    expect(res.status).toBe(400);
    expect(service.detectContextSource).not.toHaveBeenCalled();
  });

  it('detect rejects manualTerms supplied as a string', async () => {
    const res = await request(createApp(), 'POST', DETECT, {}, { manualTerms: 'x' });
    expect(res.status).toBe(400);
    expect(service.detectContextSource).not.toHaveBeenCalled();
  });

  it('detect rejects manualTerms supplied as null', async () => {
    const res = await request(createApp(), 'POST', DETECT, {}, { manualTerms: null });
    expect(res.status).toBe(400);
    expect(service.detectContextSource).not.toHaveBeenCalled();
  });

  it('detect rejects a single malformed entry inside an otherwise valid array', async () => {
    const res = await request(createApp(), 'POST', DETECT, {}, {
      manualTerms: [{ term: 'Kovács Péter', category: 'PERSON' }, { term: 'X', category: 123 }],
    });
    expect(res.status).toBe(400);
    expect(service.detectContextSource).not.toHaveBeenCalled();
  });

  it('detect rejects a blank term', async () => {
    const res = await request(createApp(), 'POST', DETECT, {}, { manualTerms: [{ term: '   ', category: 'PERSON' }] });
    expect(res.status).toBe(400);
    expect(service.detectContextSource).not.toHaveBeenCalled();
  });

  it('detect rejects too many manual terms rather than truncating', async () => {
    const terms = Array.from({ length: 101 }, (_, i) => ({ term: `term${i}`, category: 'PERSON' }));
    const res = await request(createApp(), 'POST', DETECT, {}, { manualTerms: terms });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MANUAL_TERMS_TOO_MANY');
    expect(service.detectContextSource).not.toHaveBeenCalled();
  });

  it('detect rejects an oversized individual term rather than truncating', async () => {
    const res = await request(createApp(), 'POST', DETECT, {}, { manualTerms: [{ term: 'a'.repeat(501), category: 'PERSON' }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MANUAL_TERM_TOO_LONG');
    expect(service.detectContextSource).not.toHaveBeenCalled();
  });

  it('anonymize rejects a non-array approvedCandidateIds before reaching the service', async () => {
    const res = await request(createApp(), 'POST', ANONYMIZE, {}, { sourceHash: 'h', optionsDigest: 'd', approvedCandidateIds: 'cand-1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_APPROVED_CANDIDATE_IDS');
    expect(service.anonymizeContextSource).not.toHaveBeenCalled();
  });

  it('anonymize rejects a missing approvedCandidateIds', async () => {
    const res = await request(createApp(), 'POST', ANONYMIZE, {}, { sourceHash: 'h', optionsDigest: 'd' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_APPROVED_CANDIDATE_IDS');
    expect(service.anonymizeContextSource).not.toHaveBeenCalled();
  });

  it('anonymize rejects a null approvedCandidateIds', async () => {
    const res = await request(createApp(), 'POST', ANONYMIZE, {}, { sourceHash: 'h', optionsDigest: 'd', approvedCandidateIds: null });
    expect(res.status).toBe(400);
    expect(service.anonymizeContextSource).not.toHaveBeenCalled();
  });

  it('anonymize rejects approvedCandidateIds containing a non-string', async () => {
    const res = await request(createApp(), 'POST', ANONYMIZE, {}, { sourceHash: 'h', optionsDigest: 'd', approvedCandidateIds: ['cand-1', 123] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_APPROVED_CANDIDATE_IDS');
    expect(service.anonymizeContextSource).not.toHaveBeenCalled();
  });

  it('anonymize rejects approvedCandidateIds containing a blank string', async () => {
    const res = await request(createApp(), 'POST', ANONYMIZE, {}, { sourceHash: 'h', optionsDigest: 'd', approvedCandidateIds: ['cand-1', '   '] });
    expect(res.status).toBe(400);
    expect(service.anonymizeContextSource).not.toHaveBeenCalled();
  });

  it('anonymize accepts an explicitly empty approvedCandidateIds and reaches the service', async () => {
    const res = await request(createApp(), 'POST', ANONYMIZE, {}, { sourceHash: 'h', optionsDigest: 'd', approvedCandidateIds: [] });
    expect(res.status).toBe(200);
    expect(service.anonymizeContextSource).toHaveBeenCalled();
  });

  it('anonymize accepts a string-only approvedCandidateIds array and reaches the service', async () => {
    const res = await request(createApp(), 'POST', ANONYMIZE, {}, { sourceHash: 'h', optionsDigest: 'd', approvedCandidateIds: ['cand-1'] });
    expect(res.status).toBe(200);
    expect(service.anonymizeContextSource).toHaveBeenCalled();
  });
});
