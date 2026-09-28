/**
 * GWO-1 source-contract repair — outgoing request tests (R01–R07).
 * A local HTTP server captures the real outgoing request; no external calls.
 * R01 multipart FormData; R02 DATASOURCE=SEDIA; R03 type set exactly 1/2/8;
 * R04 the three lifecycle statuses; R05 languages en; R06 default text ***;
 * R07 multipart Content-Type is generated (boundary), never set manually.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  DISCOVERY_LANGUAGE,
  FUNDING_DATASOURCE,
  FUNDING_LIFECYCLE_STATUSES,
  FUNDING_SOURCE_TYPES,
  buildDiscoveryFormData,
  buildDiscoveryQuery,
  buildDiscoveryUrl,
  executeFundingTendersSearch,
} from '../src/adapters/fundingTenders/request.ts';

interface Captured {
  method: string;
  url: string;
  contentType: string;
  body: string;
}

async function captureRequest(): Promise<{ captured: Captured; status: number }> {
  let captured: Captured | null = null;
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => {
      captured = {
        method: req.method ?? '',
        url: req.url ?? '',
        contentType: String(req.headers['content-type'] ?? ''),
        body,
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ apiVersion: 'test', results: [] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const envelope = await executeFundingTendersSearch({
      url: `http://127.0.0.1:${port}/search`,
      pageSize: 10,
      maxRetries: 0,
      timeoutMs: 5000,
    });
    assert.equal(envelope.results.length, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  assert.ok(captured, 'server must have captured the request');
  return { captured: captured as Captured, status: 200 };
}

function decodeQueryPart(body: string): string {
  const index = body.indexOf('name="query"');
  assert.ok(index >= 0, 'multipart body must contain the query part');
  const start = body.indexOf('\r\n\r\n', index);
  assert.ok(start >= 0);
  const end = body.indexOf('\r\n--', start);
  return body.slice(start + 4, end);
}

function decodeLanguagesPart(body: string): string {
  const index = body.indexOf('name="languages"');
  assert.ok(index >= 0, 'multipart body must contain the languages part');
  const start = body.indexOf('\r\n\r\n', index);
  const end = body.indexOf('\r\n--', start);
  return body.slice(start + 4, end);
}

test('R01: outgoing request is multipart/form-data with sort, query and languages parts', async () => {
  const { captured } = await captureRequest();
  assert.equal(captured.method, 'POST');
  assert.ok(captured.contentType.startsWith('multipart/form-data; boundary='), captured.contentType);
  for (const part of ['sort', 'query', 'languages']) {
    assert.ok(captured.body.includes(`name="${part}"`), `missing part ${part}`);
  }
  assert.ok(captured.body.includes('name="sort"'));
  const sortIndex = captured.body.indexOf('name="sort"');
  const sortStart = captured.body.indexOf('\r\n\r\n', sortIndex);
  const sortEnd = captured.body.indexOf('\r\n--', sortStart);
  assert.deepEqual(JSON.parse(captured.body.slice(sortStart + 4, sortEnd)), { order: 'DESC', field: 'startDate' });
});

test('R02: query part selects DATASOURCE=["SEDIA"]', async () => {
  const { captured } = await captureRequest();
  const query = JSON.parse(decodeQueryPart(captured.body)) as { bool: { must: { terms: Record<string, string[]> }[] } };
  const datasource = query.bool.must.map((term) => term.terms).find((entry) => 'DATASOURCE' in entry);
  assert.ok(datasource, 'DATASOURCE term missing');
  assert.deepEqual(datasource['DATASOURCE'], [...FUNDING_DATASOURCE]);
});

test('R03: funding type set is exactly ["1","2","8"]', () => {
  const query = buildDiscoveryQuery() as { bool: { must: { terms: Record<string, string[]> }[] } };
  const typeTerm = query.bool.must.find((term) => 'type' in term.terms);
  assert.ok(typeTerm);
  assert.deepEqual(typeTerm.terms['type'], ['1', '2', '8']);
  assert.deepEqual([...FUNDING_SOURCE_TYPES], ['1', '2', '8']);
});

test('R04: statuses are the three known F&T lifecycle codes', async () => {
  const { captured } = await captureRequest();
  const query = JSON.parse(decodeQueryPart(captured.body)) as { bool: { must: { terms: Record<string, string[]> }[] } };
  const statusTerm = query.bool.must.find((term) => 'status' in term.terms);
  assert.ok(statusTerm);
  assert.deepEqual(statusTerm.terms['status'], ['31094501', '31094502', '31094503']);
  assert.deepEqual([...FUNDING_LIFECYCLE_STATUSES], ['31094501', '31094502', '31094503']);
});

test('R05: language term is en and languages part contains ["en"]', async () => {
  const { captured } = await captureRequest();
  const query = JSON.parse(decodeQueryPart(captured.body)) as { bool: { must: { terms: Record<string, string[]> }[] } };
  const languageTerm = query.bool.must.find((term) => 'language' in term.terms);
  assert.ok(languageTerm);
  assert.deepEqual(languageTerm.terms['language'], [DISCOVERY_LANGUAGE]);
  assert.deepEqual(JSON.parse(decodeLanguagesPart(captured.body)), ['en']);
});

test('R06: default search text is *** in the URL query', async () => {
  const { captured } = await captureRequest();
  assert.ok(captured.url.includes('text=***'), captured.url);
  assert.ok(captured.url.includes('pageSize=10'), captured.url);
  assert.ok(captured.url.includes('pageNumber=1'), captured.url);
  const direct = buildDiscoveryUrl({ pageSize: 5, pageNumber: 2 });
  assert.ok(direct.includes('pageSize=5') && direct.includes('pageNumber=2'));
});

test('R07: multipart Content-Type is generated, never set manually', async () => {
  const { captured } = await captureRequest();
  // A manually set header would be exactly "multipart/form-data" without a
  // boundary; fetch/FormData always generates the boundary parameter.
  assert.match(captured.contentType, /^multipart\/form-data; boundary=.+/);
});

test('R07b: FormData builder exposes exactly the three JSON blob parts', () => {
  const form = buildDiscoveryFormData();
  assert.deepEqual([...form.keys()], ['sort', 'query', 'languages']);
  for (const value of form.values()) {
    assert.ok(value instanceof Blob, 'each part must be a Blob');
  }
});
