/**
 * Comparison API routes (STRUCTURED-DOC-COMPARISON-1, Phase 6).
 *
 * Auth-first, authorization, version-pair validation, pagination/filters,
 * segment mutation with optimistic-conflict handling, and safe DTOs (no storage
 * keys / raw rows). Auth, authorization and the services are mocked; the DTO
 * mappers run for real so the response shape is exercised end-to-end.
 */
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';

const svc = {
  createOrGetComparison: jest.fn(),
  getComparison: jest.fn(),
  listComparisonsForDocument: jest.fn(),
  listSegments: jest.fn(),
  updateSegment: jest.fn(),
  linkSegmentTask: jest.fn(),
  linkSegmentAnnotation: jest.fn(),
};

class MockComparisonError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

jest.mock('../src/middleware/auth', () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== 'Bearer test-token') { res.status(401).json({ code: 'NO_TOKEN' }); return; }
    (req as any).user = { userId: 'actor-1', role: 'LAWYER' };
    next();
  },
}));
const passthrough = (_req: Request, _res: Response, next: NextFunction) => next();
jest.mock('../src/modules/documents/authorization', () => ({
  requireDocumentReadAccess: passthrough, requireDocumentManageAccess: passthrough,
}));
jest.mock('../src/modules/documents/comparison/comparisonAuthorization', () => ({
  requireComparisonReadAccess: passthrough, requireComparisonManageAccess: passthrough,
}));
jest.mock('../src/modules/documents/comparison/comparisonService', () => ({
  createOrGetComparison: (...a: any[]) => svc.createOrGetComparison(...a),
  ComparisonError: MockComparisonError,
}));
jest.mock('../src/modules/documents/comparison/comparisonReadService', () => ({
  getComparison: (...a: any[]) => svc.getComparison(...a),
  listComparisonsForDocument: (...a: any[]) => svc.listComparisonsForDocument(...a),
  listSegments: (...a: any[]) => svc.listSegments(...a),
  updateSegment: (...a: any[]) => svc.updateSegment(...a),
  linkSegmentTask: (...a: any[]) => svc.linkSegmentTask(...a),
  linkSegmentAnnotation: (...a: any[]) => svc.linkSegmentAnnotation(...a),
}));
jest.mock('../src/modules/documents/services', () => ({ __esModule: true, default: { downloadDocumentVersion: jest.fn() } }));

import { documentScopedComparisonRouter, comparisonRouter } from '../src/modules/documents/comparison/comparison.routes';

const app = express();
app.use(express.json());
app.use('/api/v1/documents', documentScopedComparisonRouter);
app.use('/api/v1/document-comparisons', comparisonRouter);
const server = http.createServer(app);
beforeAll((done) => { server.listen(0, done); });
afterAll((done) => { server.close(done); });
beforeEach(() => jest.clearAllMocks());

function req(method: string, path: string, { token = 'test-token', body }: { token?: string | null; body?: any } = {}): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as any;
    const payload = body ? JSON.stringify(body) : undefined;
    const r = http.request({ host: '127.0.0.1', port: addr.port, path, method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
    } }, (resp) => {
      let data = ''; resp.on('data', (c) => (data += c));
      resp.on('end', () => resolve({ status: resp.statusCode || 0, json: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const CMP = {
  id: 'cmp-1', documentId: 'doc-1', baseVersionId: 'vB', targetVersionId: 'vT', status: 'READY',
  algorithmRevision: 1, extractionRevision: 1, createdAt: new Date(), startedAt: new Date(), completedAt: new Date(),
  failureCode: null, failureMessageSafe: null, insertCount: 1, deleteCount: 0, replaceCount: 1, formatOnlyCount: 0,
  moveCandidateCount: 0, totalSegmentCount: 2, reviewedSegmentCount: 0,
  // deliberately include a forbidden field to prove the mapper drops it
  storageReference: 'SECRET-STORAGE-KEY',
};
const SEG = {
  id: 'seg-1', comparisonId: 'cmp-1', sequence: 0, changeType: 'REPLACE', baseStart: 0, baseEnd: 5,
  targetStart: 0, targetEnd: 6, baseExcerpt: '100', targetExcerpt: '250', contextBefore: null, contextAfter: 'ctx',
  confidence: 0.9, reviewState: 'UNREVIEWED', category: 'AMOUNT', categorySource: 'MANUAL', internalRationale: null,
  linkedTaskId: null, linkedAnnotationId: null, revision: 3,
};

describe('authentication and validation', () => {
  it('rejects an unauthenticated request', async () => {
    const r = await req('POST', '/api/v1/documents/doc-1/comparisons', { token: null, body: { baseVersionId: 'vB', targetVersionId: 'vT' } });
    expect(r.status).toBe(401);
    expect(svc.createOrGetComparison).not.toHaveBeenCalled();
  });

  it('requires a version pair', async () => {
    const r = await req('POST', '/api/v1/documents/doc-1/comparisons', { body: {} });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('VERSION_PAIR_REQUIRED');
  });

  it('surfaces a cross-document rejection from the service', async () => {
    svc.createOrGetComparison.mockRejectedValue(new MockComparisonError('CROSS_DOCUMENT_VERSIONS', 'nope', 400));
    const r = await req('POST', '/api/v1/documents/doc-1/comparisons', { body: { baseVersionId: 'vB', targetVersionId: 'vX' } });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('CROSS_DOCUMENT_VERSIONS');
  });
});

describe('create + read', () => {
  it('creates a comparison and returns a safe DTO without storage keys', async () => {
    svc.createOrGetComparison.mockResolvedValue(CMP);
    const r = await req('POST', '/api/v1/documents/doc-1/comparisons', { body: { baseVersionId: 'vB', targetVersionId: 'vT' } });
    expect(r.status).toBe(201);
    expect(r.json.id).toBe('cmp-1');
    expect(r.json.counts.total).toBe(2);
    const body = JSON.stringify(r.json);
    expect(body).not.toContain('SECRET-STORAGE-KEY');
    expect(body).not.toMatch(/storageReference|storageKey|spItemId/);
  });

  it('lists comparisons for a document', async () => {
    svc.listComparisonsForDocument.mockResolvedValue([CMP]);
    const r = await req('GET', '/api/v1/documents/doc-1/comparisons');
    expect(r.status).toBe(200);
    expect(r.json.data).toHaveLength(1);
    expect(JSON.stringify(r.json)).not.toContain('SECRET-STORAGE-KEY');
  });

  it('gets a single comparison', async () => {
    svc.getComparison.mockResolvedValue(CMP);
    const r = await req('GET', '/api/v1/document-comparisons/cmp-1');
    expect(r.status).toBe(200);
    expect(r.json.baseVersionId).toBe('vB');
  });
});

describe('segments: pagination and filters', () => {
  it('passes pagination and filters to the service and returns bounded excerpts', async () => {
    svc.listSegments.mockResolvedValue({ items: [SEG], total: 1, limit: 50, offset: 10 });
    const r = await req('GET', '/api/v1/document-comparisons/cmp-1/segments?changeType=REPLACE&category=AMOUNT&reviewState=UNREVIEWED&unreviewedOnly=true&limit=50&offset=10');
    expect(r.status).toBe(200);
    expect(svc.listSegments).toHaveBeenCalledWith('cmp-1', expect.objectContaining({
      changeType: 'REPLACE', category: 'AMOUNT', unreviewedOnly: true, limit: 50, offset: 10,
    }));
    expect(r.json.data[0].category).toBe('AMOUNT');
    expect(r.json.total).toBe(1);
  });
});

describe('segment mutations', () => {
  it('updates review state / category', async () => {
    svc.updateSegment.mockResolvedValue({ ...SEG, reviewState: 'ACCEPTED', revision: 4 });
    const r = await req('PATCH', '/api/v1/document-comparisons/cmp-1/segments/seg-1', { body: { reviewState: 'ACCEPTED', expectedRevision: 3 } });
    expect(r.status).toBe(200);
    expect(r.json.reviewState).toBe('ACCEPTED');
    expect(svc.updateSegment).toHaveBeenCalledWith('cmp-1', 'seg-1', expect.objectContaining({ reviewState: 'ACCEPTED', expectedRevision: 3 }));
  });

  it('returns 409 on an optimistic-concurrency conflict', async () => {
    svc.updateSegment.mockRejectedValue(new MockComparisonError('REVISION_CONFLICT', 'conflict', 409));
    const r = await req('PATCH', '/api/v1/document-comparisons/cmp-1/segments/seg-1', { body: { reviewState: 'ACCEPTED', expectedRevision: 1 } });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe('REVISION_CONFLICT');
  });

  it('links and unlinks a task', async () => {
    svc.linkSegmentTask.mockResolvedValue({ ...SEG, linkedTaskId: 'task-9', revision: 4 });
    const r = await req('POST', '/api/v1/document-comparisons/cmp-1/segments/seg-1/task-link', { body: { taskId: 'task-9' } });
    expect(r.status).toBe(200);
    expect(r.json.linkedTaskId).toBe('task-9');
    svc.linkSegmentTask.mockResolvedValue({ ...SEG, linkedTaskId: null, revision: 5 });
    const r2 = await req('DELETE', '/api/v1/document-comparisons/cmp-1/segments/seg-1/task-link');
    expect(r2.status).toBe(200);
    expect(r2.json.linkedTaskId).toBeNull();
  });

  it('requires a taskId to link', async () => {
    const r = await req('POST', '/api/v1/document-comparisons/cmp-1/segments/seg-1/task-link', { body: {} });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe('TASK_ID_REQUIRED');
  });
});
