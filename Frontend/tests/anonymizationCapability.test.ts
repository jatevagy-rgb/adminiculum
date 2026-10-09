import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AnonymizationCapabilityNotice, useAnonymizationCapability } from '../src/components/documents/anonymizationCapability';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as { JSDOM: new (html?: string, options?: object) => any };

const response = (status: number, code?: string) => new Response(JSON.stringify(status === 200 ? [] : { code, error: 'synthetic error' }), {
  status, headers: { 'content-type': 'application/json' },
});

async function withCapability(fetchImpl: typeof fetch, run: (view: {
  status: () => string;
  text: () => string;
  retry: () => Promise<void>;
  switchCase: (caseId: string) => Promise<void>;
}) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/cases/one', pretendToBeVisual: true });
  const globals = globalThis as Record<string, unknown>;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true, fetch: fetchImpl,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globals, key));
    Object.defineProperty(globals, key, { value, configurable: true, writable: true });
  }
  dom.window.localStorage.setItem('auth_token', 'synthetic-workforce-token');
  let caseId = 'one';
  const Probe = ({ id }: { id: string }) => {
    const capability = useAnonymizationCapability(id);
    return React.createElement('div', null,
      React.createElement('span', { 'data-testid': 'status' }, capability.status),
      React.createElement(AnonymizationCapabilityNotice, { status: capability.status, onRetry: capability.retry }),
    );
  };
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await React.act(async () => { root.render(React.createElement(Probe, { id: caseId })); });
    const settle = async () => { await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
    await settle();
    await run({
      status: () => dom.window.document.querySelector('[data-testid="status"]')?.textContent ?? '',
      text: () => dom.window.document.body.textContent ?? '',
      retry: async () => { await React.act(async () => { (dom.window.document.querySelector('button') as HTMLButtonElement).click(); }); await settle(); },
      switchCase: async (next) => { caseId = next; await React.act(async () => { root.render(React.createElement(Probe, { id: caseId })); }); await settle(); },
    });
  } finally {
    await React.act(async () => { root.unmount(); });
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globals, key, descriptor);
      else Reflect.deleteProperty(globals, key);
    }
    dom.window.close();
  }
}

test('501 FEATURE_DISABLED is the only disabled result; successful empty lists remain available', async () => {
  await withCapability(async () => response(501, 'FEATURE_DISABLED'), async ({ status, text }) => {
    assert.equal(status(), 'DISABLED');
    assert.match(text(), /új munkapéldány nem készíthető/);
  });
  await withCapability(async () => response(200), async ({ status, text }) => {
    assert.equal(status(), 'AVAILABLE');
    assert.doesNotMatch(text(), /ki van kapcsolva/);
  });
});

test('authorization, other 501s and transient failures never claim disabled or empty', async () => {
  for (const [statusCode, code, expected] of [[403, 'CASE_ACCESS_FORBIDDEN', 'UNAUTHORIZED'], [501, 'OTHER', 'UNAVAILABLE'], [500, 'PROCESSING_FAILURE', 'UNAVAILABLE']] as const) {
    await withCapability(async () => response(statusCode, code), async ({ status, text }) => {
      assert.equal(status(), expected);
      assert.doesNotMatch(text(), /ki van kapcsolva|Nincs anonimizált változat/);
    });
  }
});

test('retry can recover without treating the first read failure as no copies', async () => {
  let calls = 0;
  await withCapability(async () => ++calls === 1 ? response(500) : response(200), async ({ status, retry }) => {
    assert.equal(status(), 'UNAVAILABLE');
    await retry();
    assert.equal(status(), 'AVAILABLE');
    assert.equal(calls, 2);
  });
});

test('a previous case response cannot enable another case launcher', async () => {
  let resolveOld!: (response: Response) => void;
  await withCapability(async (input) => String(input).includes('caseId=one')
    ? new Promise<Response>((resolve) => { resolveOld = resolve; })
    : response(501, 'FEATURE_DISABLED'), async ({ status, switchCase }) => {
    assert.equal(status(), 'CHECKING');
    await switchCase('two');
    assert.equal(status(), 'DISABLED');
    await React.act(async () => { resolveOld(response(200)); });
    assert.equal(status(), 'DISABLED');
  });
});

test('all production launchers use the same capability and never open on failed reads', () => {
  const sources = [
    'src/components/CaseDetail.tsx',
    'src/components/documents/DocumentPreparationDashboard.tsx',
    'src/components/cases/word-workflow/documents/DocumentAIFlow.tsx',
    'src/app/cases/[caseId]/generate/GenerationPageContent.tsx',
    'src/app/cases/[caseId]/documents/page.tsx',
  ].map((file) => readFileSync(path.resolve(process.cwd(), file), 'utf8'));
  for (const source of sources) {
    assert.match(source, /useAnonymizationCapability\(/);
    assert.match(source, /AnonymizationCapabilityNotice/);
    assert.match(source, /anonymization\.status !== "AVAILABLE"/);
    assert.match(source, /anonymization\.status === "AVAILABLE" (?:&&|\?) \(/);
  }
  assert.match(sources[1], /preparation-anonymized-disabled/);
  assert.match(sources[2], /anonymousReadDisabled && anonymousList\.length === 0/);
  assert.match(sources[2], /setAnonymousError\("Az anonimizált munkapéldányok listája nem érhető el\."\)/);
  assert.match(sources[4], /canLaunchAnonymization/);
  assert.match(sources[4], /selectedVersionBelongsToActiveDocument && Boolean\(selectedVersion\?\.isCurrent\)/);
});
