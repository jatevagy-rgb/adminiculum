import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as { JSDOM: new (html?: string, options?: any) => any };

test('history panel ignores a delayed prior-case response after the visible case changes', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/cases/case-A', pretendToBeVisual: true,
  });
  const globals = globalThis as any;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const setGlobal = (name: string, value: any) => {
    previous.set(name, Object.getOwnPropertyDescriptor(globals, name));
    Object.defineProperty(globals, name, { value, configurable: true, writable: true });
  };
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) setGlobal(name, value);
  dom.window.localStorage.setItem('auth_token', 'synthetic-workforce-token');

  let releaseCaseA!: (response: Response) => void;
  const slowA = new Promise<Response>((resolve) => { releaseCaseA = resolve; });
  const requests: string[] = [];
  const page = (label: string) => new Response(JSON.stringify({
    items: [{ sourceKey: `timeline:${label}`, kind: 'AUDIT', occurredAt: '2026-10-01T10:00:00Z', title: label, detail: null, authorName: null, minutes: null }],
    nextCursor: null, totalMinutes: 0,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  setGlobal('fetch', (input: string) => {
    requests.push(String(input));
    return String(input).includes('/case-A') ? slowA : Promise.resolve(page('B event'));
  });

  let root: import('react-dom/client').Root | null = null;
  try {
    const React = await import('react');
    setGlobal('React', React);
    const { createRoot } = await import('react-dom/client');
    const { CaseHistoryPanel } = await import('../src/components/cases/word-workflow/history/CaseHistoryPanel');
    root = createRoot(dom.window.document.getElementById('root')!);
    await React.act(async () => { root!.render(React.createElement(CaseHistoryPanel, { caseId: 'case-A', clientId: 'client-A' })); });
    assert.ok(requests.some((url) => url.endsWith('/case-A')));

    await React.act(async () => { root!.render(React.createElement(CaseHistoryPanel, { caseId: 'case-B', clientId: 'client-B' })); });
    assert.ok(requests.some((url) => url.endsWith('/case-B')));
    assert.match(dom.window.document.body.textContent, /B event/);

    await React.act(async () => { releaseCaseA(page('A event')); await slowA; });
    assert.match(dom.window.document.body.textContent, /B event/);
    assert.doesNotMatch(dom.window.document.body.textContent, /A event/);
  } finally {
    if (root) {
      const React = await import('react');
      await React.act(async () => { root!.unmount(); });
    }
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globals, name, descriptor);
      else delete globals[name];
    }
    dom.window.close();
  }
});
