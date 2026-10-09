import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as { JSDOM: new (html?: string, options?: any) => any };

const CASE_ID = 'case-A';
const ABSENCE_ASSERTION = /nincs mentett ügytörténet-megosztási szabály/;
const NEUTRAL_PREVIEW = /Az ügyfélnek látható tartalmat az ügytörténet megosztási szabálya határozza meg\. A belső események nem jelennek meg automatikusan\./;
const POLICY_READ_ERROR = /A megosztási szabály nem tölthető be\. Nem tudjuk megállapítani, van-e mentett szabály\./;

type FetchImpl = (input: string, init?: any) => Promise<Response>;

const historyPage = (items: { title: string }[] = []) => new Response(JSON.stringify({
  items: items.map((item, index) => ({
    sourceKey: `timeline:${index}`,
    kind: 'AUDIT',
    occurredAt: '2026-10-01T10:00:00Z',
    title: item.title,
    detail: null,
    authorName: null,
    minutes: null,
  })),
  nextCursor: null,
  totalMinutes: 0,
}), { status: 200, headers: { 'content-type': 'application/json' } });

const policyResponse = (overrides: Record<string, unknown> = {}) => new Response(JSON.stringify({
  revision: 0,
  publishedNumber: null,
  draftNumber: null,
  reviewed: false,
  snapshot: null,
  grants: [],
  publications: [],
  sources: [],
  canManage: true,
  canPublish: false,
  ...overrides,
}), { status: 200, headers: { 'content-type': 'application/json' } });

const errorResponse = (status: number, code?: string) => new Response(JSON.stringify({ error: 'unavailable', code }), {
  status,
  headers: { 'content-type': 'application/json' },
});

async function withPanel(
  fetchImpl: FetchImpl,
  run: (view: { text: () => string; previewText: () => string; retry: () => Promise<void> }) => Promise<void>,
  clientId: string | null = 'client-A',
) {
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
  setGlobal('fetch', fetchImpl);

  let root: import('react-dom/client').Root | null = null;
  try {
    const React = await import('react');
    setGlobal('React', React);
    const { createRoot } = await import('react-dom/client');
    const { CaseHistoryPanel } = await import('../src/components/cases/word-workflow/history/CaseHistoryPanel');
    root = createRoot(dom.window.document.getElementById('root')!);
    await React.act(async () => {
      root!.render(React.createElement(CaseHistoryPanel, { caseId: CASE_ID, clientId }));
    });
    await React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await run({
      text: () => dom.window.document.body.textContent ?? '',
      previewText: () => dom.window.document.querySelector('details[aria-label="Ügytörténet megosztása"]')?.textContent ?? '',
      retry: async () => {
        await React.act(async () => {
          const button = [...dom.window.document.querySelectorAll('button')].find((item: HTMLButtonElement) => item.textContent === 'Újrapróbálás');
          assert.ok(button, 'policy retry remains available');
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      },
    });
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
}

const routedFetch = (policy: () => Response | Promise<Response>, items: { title: string }[] = []): FetchImpl =>
  (input: string) => Promise.resolve(String(input).includes('/policy') ? policy() : historyPage(items));

test('failed history-policy read keeps the read error and never asserts that no policy exists', async () => {
  await withPanel(routedFetch(() => errorResponse(500)), async ({ text }) => {
    assert.match(text(), POLICY_READ_ERROR);
    assert.doesNotMatch(text(), ABSENCE_ASSERTION);
    assert.match(text(), NEUTRAL_PREVIEW);
  });
});

test('unauthorized policy reads remain distinct from absence and from transport errors', async () => {
  for (const status of [401, 403]) {
    await withPanel(routedFetch(() => errorResponse(status)), async ({ text }) => {
      assert.match(text(), /Nincs jogosultsága az ügyféltörténet megosztási szabályának megtekintéséhez/);
      assert.doesNotMatch(text(), ABSENCE_ASSERTION);
      assert.match(text(), NEUTRAL_PREVIEW);
    });
  }
});

test('a disabled publication capability is not a failed read or an empty policy', async () => {
  await withPanel(routedFetch(() => errorResponse(503, 'HISTORY_CAPABILITY_UNAVAILABLE')), async ({ text }) => {
    assert.match(text(), /Az ügyféltörténet megosztása jelenleg nem érhető el/);
    assert.doesNotMatch(text(), POLICY_READ_ERROR);
    assert.doesNotMatch(text(), ABSENCE_ASSERTION);
    assert.match(text(), NEUTRAL_PREVIEW);
  });
});

test('a transient policy failure can recover without publishing or exposing internal events', async () => {
  let calls = 0;
  await withPanel(routedFetch(() => ++calls === 1 ? errorResponse(500) : policyResponse(), [{ title: 'Belső esemény' }]), async ({ text, previewText, retry }) => {
    assert.match(text(), POLICY_READ_ERROR);
    await retry();
    assert.match(text(), /Mentett piszkozat/);
    assert.doesNotMatch(previewText(), /Belső esemény/);
    assert.equal(calls, 2);
  });
});

test('an unknown missing policy endpoint is not interpreted as no saved policy', async () => {
  await withPanel(routedFetch(() => errorResponse(404)), async ({ text }) => {
    assert.match(text(), POLICY_READ_ERROR);
    assert.doesNotMatch(text(), ABSENCE_ASSERTION);
    assert.match(text(), NEUTRAL_PREVIEW);
  });
});

test('loading the policy is not shown as an empty state', async () => {
  await withPanel(routedFetch(() => new Promise<Response>(() => {})), async ({ text }) => {
    assert.match(text(), /A megosztási szabály betöltése/);
    assert.doesNotMatch(text(), ABSENCE_ASSERTION);
    assert.match(text(), NEUTRAL_PREVIEW);
  });
});

test('successful canonical read with no saved policy keeps the preview truthful', async () => {
  await withPanel(routedFetch(() => policyResponse()), async ({ text, previewText }) => {
    assert.match(text(), /Ügyféltörténet megosztása/);
    assert.match(previewText(), NEUTRAL_PREVIEW);
    assert.doesNotMatch(text(), ABSENCE_ASSERTION);
  });
});

test('existing policy keeps its loaded presentation and the preview stays truthful', async () => {
  await withPanel(routedFetch(() => policyResponse({
    revision: 3,
    reviewed: true,
    canPublish: true,
    snapshot: {
      level: 2,
      audienceGrantId: 'grant-1',
      publicationId: 'publication-1',
      overlays: [],
    },
  })), async ({ text }) => {
    assert.match(text(), /Ügyféltörténet megosztása/);
    assert.match(text(), /Közzététel a portálon és jelentésben/);
    assert.match(text(), NEUTRAL_PREVIEW);
    assert.doesNotMatch(text(), ABSENCE_ASSERTION);
  });
});

test('internal events are not automatically visible in the customer preview', async () => {
  await withPanel(routedFetch(() => policyResponse(), [{ title: 'Belső esemény' }]), async ({ text, previewText }) => {
    assert.match(text(), /Belső esemény/);
    assert.doesNotMatch(previewText(), /Belső esemény/);
    assert.match(previewText(), NEUTRAL_PREVIEW);
    assert.match(previewText(), /nem jelennek meg automatikusan/);
  });
});
