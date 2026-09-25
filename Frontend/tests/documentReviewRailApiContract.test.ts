/**
 * Frontend API-contract test for the Document Workspace Phase 2 client:
 * modification proposals, narrow review comments and the version-scoped review
 * rail. The REAL client functions are exercised against a local HTTP server so
 * exact URLs, methods and payloads are pinned. No reader UI is touched.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let server: http.Server;
let baseUrl = '';
let api: typeof import('../src/lib/api');
let captured: Array<{ url: string | undefined; method: string | undefined; body: string }> = [];

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      captured.push({ url: req.url, method: req.method, body });
      const url = req.url || '';

      if (/\/versions\/v1\/review-rail(\?|$)/.test(url)) {
        json(res, 200, {
          documentId: 'doc-1',
          documentVersionId: 'v1',
          versionNumber: 1,
          counts: {
            commentCount: 2,
            modificationProposalCount: 1,
            pendingProposalCount: 0,
            acceptedProposalCount: 1,
            rejectedProposalCount: 0,
            proposalDecisionComplete: true,
          },
          readyForCorrection: true,
          comments: [],
          proposals: [],
        });
        return;
      }
      if (/\/versions\/v1\/proposals\/p1\/accept$/.test(url)) {
        json(res, 200, { id: 'p1', status: 'ACCEPTED' });
        return;
      }
      if (/\/versions\/v1\/proposals\/p1\/reject$/.test(url)) {
        json(res, 200, { id: 'p1', status: 'REJECTED' });
        return;
      }
      if (/\/versions\/v1\/proposals\/p1$/.test(url)) {
        json(res, 200, { id: 'p1', status: 'PENDING', deletedAt: '2026-01-01T00:00:00.000Z' });
        return;
      }
      if (/\/versions\/v1\/proposals$/.test(url)) {
        json(res, 201, { id: 'p-new', status: 'PENDING' });
        return;
      }
      if (/\/versions\/v1\/review-comments\/a1\/replies$/.test(url)) {
        json(res, 201, { id: 'reply-1', annotationId: 'a1', body: 'valasz' });
        return;
      }
      if (/\/versions\/v1\/review-comments$/.test(url)) {
        json(res, 201, { id: 'a-new', annotationType: 'REVIEW_COMMENT' });
        return;
      }
      json(res, 404, { status: 404, code: 'NOT_FOUND', message: 'Not found' });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL = baseUrl;

  const store = new Map<string, string>([['adminiculum:auth_token:workforce', 'test-token']]);
  (globalThis as any).window = {
    location: { pathname: '/cases/case-1/documents' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
  };

  api = await import('../src/lib/api');
});

after(() => {
  server?.close();
});

beforeEach(() => {
  captured = [];
});

test('getDocumentReviewRail resolves the exact version-scoped rail and exposes the completion alias', async () => {
  const rail = await api.getDocumentReviewRail('doc-1', 'v1', { limit: 10 });
  assert.equal(captured[0].method, 'GET');
  assert.equal(captured[0].url, '/api/v1/documents/doc-1/versions/v1/review-rail?limit=10');
  assert.equal(rail.readyForCorrection, true);
  assert.equal(rail.counts.proposalDecisionComplete, true);
  assert.equal(rail.counts.commentCount, 2);
});

test('proposal lifecycle calls the exact routes and methods', async () => {
  await api.createDocumentModificationProposal('doc-1', 'v1', {
    selectedText: 'a',
    startOffset: 0,
    endOffset: 1,
    proposedText: 'b',
    idempotencyKey: 'k1',
  });
  assert.equal(captured[0].method, 'POST');
  assert.equal(captured[0].url, '/api/v1/documents/doc-1/versions/v1/proposals');
  assert.deepEqual(JSON.parse(captured[0].body), {
    selectedText: 'a',
    startOffset: 0,
    endOffset: 1,
    proposedText: 'b',
    idempotencyKey: 'k1',
  });

  await api.acceptDocumentModificationProposal('doc-1', 'v1', 'p1');
  assert.equal(captured[1].url, '/api/v1/documents/doc-1/versions/v1/proposals/p1/accept');
  assert.equal(captured[1].method, 'POST');

  await api.rejectDocumentModificationProposal('doc-1', 'v1', 'p1', 'nem jo');
  assert.equal(captured[2].url, '/api/v1/documents/doc-1/versions/v1/proposals/p1/reject');
  assert.deepEqual(JSON.parse(captured[2].body), { reason: 'nem jo' });

  await api.withdrawDocumentModificationProposal('doc-1', 'v1', 'p1');
  assert.equal(captured[3].url, '/api/v1/documents/doc-1/versions/v1/proposals/p1');
  assert.equal(captured[3].method, 'DELETE');
});

test('review-comment authoring and replies hit the narrow reader routes', async () => {
  await api.createDocumentReviewComment('doc-1', 'v1', {
    selectedText: 'x',
    startOffset: 0,
    endOffset: 1,
    body: 'kerdes',
  });
  assert.equal(captured[0].method, 'POST');
  assert.equal(captured[0].url, '/api/v1/documents/doc-1/versions/v1/review-comments');
  assert.deepEqual(JSON.parse(captured[0].body), {
    selectedText: 'x',
    startOffset: 0,
    endOffset: 1,
    body: 'kerdes',
  });

  await api.createDocumentReviewCommentReply('doc-1', 'v1', 'a1', 'valasz');
  assert.equal(captured[1].url, '/api/v1/documents/doc-1/versions/v1/review-comments/a1/replies');
  assert.deepEqual(JSON.parse(captured[1].body), { body: 'valasz' });
});
