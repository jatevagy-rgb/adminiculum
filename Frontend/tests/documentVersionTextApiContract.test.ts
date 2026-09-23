/**
 * F-005 frontend integration: the REAL Document Workspace API client hits the
 * REAL version-text route over HTTP.
 *
 * The existing browser-wiring test proves the page selects the right channel with
 * a fake API. This suite closes the remaining gap — that the shipped client
 * (`getDocumentVersionText`) actually issues the exact version-scoped request and
 * returns exactly the selected version's body, never the current/latest one.
 *
 * A local HTTP server implements the documented endpoint contract; the real
 * client (with its real base-URL + auth wiring) performs a real network call.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const V1_TEXT = 'A szolgáltató felelőssége korlátlan.';
const V2_TEXT = 'A szolgáltató teljes felelőssége a nettó éves díj összegére korlátozott.';

let server: http.Server;
let baseUrl = '';
let api: typeof import('../src/lib/api');
let captured: Array<{ url: string | undefined; method: string | undefined; authorization: string | undefined }> = [];

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

before(async () => {
  server = http.createServer((req, res) => {
    captured.push({ url: req.url, method: req.method, authorization: req.headers.authorization });
    const match = /^\/api\/v1\/documents\/([^/]+)\/versions\/([^/]+)\/text$/.exec(req.url || '');
    if (!match) {
      json(res, 404, { status: 404, code: 'NOT_FOUND', message: 'Not found' });
      return;
    }
    const [, documentId, versionId] = match;
    if (versionId === 'missing') {
      json(res, 404, { status: 404, code: 'DOCUMENT_VERSION_NOT_FOUND', message: 'Document version not found.' });
      return;
    }
    if (versionId === 'nostore') {
      json(res, 200, {
        documentId,
        versionId,
        versionNumber: 1,
        source: 'UPLOADED',
        text: '',
        reasonCode: 'NO_VERSION_STORAGE_REFERENCE',
        unavailableReason: 'A verzióhoz nem tartozik tárolt tartalom, ezért a szöveg nem nyerhető ki.',
      });
      return;
    }
    // v1 is historical, v2 is current — each answers with ONLY its own text.
    const text = versionId === 'v1' ? V1_TEXT : V2_TEXT;
    json(res, 200, {
      documentId,
      versionId,
      versionNumber: versionId === 'v1' ? 1 : 2,
      source: 'UPLOADED',
      text,
      format: 'docx',
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server address unavailable');
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL = baseUrl;

  // Minimal browser shim so the real client resolves its auth token exactly as
  // it does in the app (no MSAL needed for this contract test).
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

test('getDocumentVersionText calls the exact version-text endpoint with the workspace token', async () => {
  await api.getDocumentVersionText('doc-1', 'v1');

  assert.equal(captured.length, 1);
  assert.equal(captured[0].method, 'GET');
  assert.equal(captured[0].url, '/api/v1/documents/doc-1/versions/v1/text');
  assert.equal(captured[0].authorization, 'Bearer test-token');
});

test('historical and current versions resolve their own exact text (no latest substitution)', async () => {
  const v1 = await api.getDocumentVersionText('doc-1', 'v1');
  const v2 = await api.getDocumentVersionText('doc-1', 'v2');

  assert.equal(v1.versionId, 'v1');
  assert.equal(v1.versionNumber, 1);
  assert.equal(v1.text, V1_TEXT);
  assert.ok(!v1.text.includes('korlátozott'));

  assert.equal(v2.versionId, 'v2');
  assert.equal(v2.versionNumber, 2);
  assert.equal(v2.text, V2_TEXT);
  assert.ok(!v2.text.includes('korlátlan'));

  assert.deepEqual(captured.map((c) => c.url), [
    '/api/v1/documents/doc-1/versions/v1/text',
    '/api/v1/documents/doc-1/versions/v2/text',
  ]);
});

test('an unavailable version resolves with an empty body and truthful reason (no throw, no text)', async () => {
  const result = await api.getDocumentVersionText('doc-1', 'nostore');

  assert.equal(result.text, '');
  assert.equal(result.reasonCode, 'NO_VERSION_STORAGE_REFERENCE');
  assert.ok(result.unavailableReason);
});

test('a version that does not exist surfaces a typed 404 the reader can map truthfully', async () => {
  await assert.rejects(
    () => api.getDocumentVersionText('doc-1', 'missing'),
    (error: any) => error?.status === 404 && error?.code === 'DOCUMENT_VERSION_NOT_FOUND',
  );
});
